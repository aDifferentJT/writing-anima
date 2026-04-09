"""
py2app build script — produces Writing Anima.app

Usage:
    cd backend
    uv run python setup.py py2app          # full release build
    uv run python setup.py py2app --alias  # fast dev build (symlinks, no zip)

The frontend must be built first:
    cd frontend && npm run build

Output: backend/dist/Writing Anima.app
"""

import hashlib
import json
import subprocess
import sys
import tarfile
import urllib.request
from collections.abc import Mapping
from pathlib import Path
from py2app.build_app import py2app  # type: ignore[import-untyped]
from setuptools import setup  # py2app still requires setuptools at build time

HERE = Path(__file__).parent
FRONTEND_DIST = HERE.parent / "frontend" / "dist"


OPTIONS: dict[str, object] = {
    # Packages that py2app's static analysis tends to miss
    "packages": [
        "src",
        "webview",
        "fastapi",
        "starlette",
        "uvicorn",
        "pydantic",
        "pydantic_core",
        "sqlmodel",
        "sqlalchemy",
        "openai",
        "qdrant_client",
        "cryptography",
        "pypdf",
        "yaml",
        "dotenv",
        "multipart",
        "tqdm",
        "huggingface_hub",
        "mlx_embeddings",
        "anyio",
        "aiofiles",
        "h11",
        "httpx",
        "httpcore",
    ],
    "resources": [
        # frontend/dist → Contents/Resources/frontend/dist
        ("frontend", [str(FRONTEND_DIST)]),
        # config.yaml → Contents/Resources/config.yaml
        str(HERE / "config.yaml"),
        # qdrant binary → Contents/Resources/qdrant
        str(HERE / "build" / "qdrant"),
        # assets catalog → Contents/Resources/Assets.car
        str(HERE / "build" / "Assets.car"),
    ],
    "plist": {
        "CFBundleName": "Writing Anima",
        "CFBundleDisplayName": "Writing Anima",
        "CFBundleIconName": "AppIcon",
        "CFBundleIdentifier": "com.hailab.writing-anima",
        "CFBundleVersion": "0.1.0",
        "CFBundleShortVersionString": "0.1.0",
        "LSMinimumSystemVersion": "12.0",
        "NSHighResolutionCapable": True,
        # Force UTF-8 as Python's default encoding inside the .app bundle.
        # Without this, macOS bundles inherit no locale and Python falls back to
        # ASCII, causing third-party libraries that open files without an explicit
        # encoding= to fail on any non-ASCII bytes (e.g. mlx_embeddings tokenizer).
        "LSEnvironment": {"PYTHONUTF8": "1"},
    },
}

def _download_qdrant(build_dir: Path) -> None:
    """Download the latest qdrant release for macOS."""
    qdrant_bin = build_dir / "qdrant"
    tar_path = build_dir / "qdrant.tar.gz"

    build_dir.mkdir(parents=True, exist_ok=True)

    print("Fetching latest qdrant release...")
    try:
        with urllib.request.urlopen("https://api.github.com/repos/qdrant/qdrant/releases/latest") as resp:
            release_data = json.loads(resp.read().decode())
    except Exception as e:
        raise RuntimeError(f"Failed to fetch qdrant release info: {e}")

    # Find the macOS arm64 release asset
    asset = None
    match [a for a in release_data.get("assets", []) if a["name"] == "qdrant-aarch64-apple-darwin.tar.gz"]:
        case [a]:
            asset = a
        case []:
            raise RuntimeError("No macOS arm64 asset found in latest qdrant release")
        case _:
            raise RuntimeError("Multiple macOS arm64 assets found in latest qdrant release")

    expected_hash = asset.get("digest", "").replace("sha256:", "")

    # Check if tar exists and has the correct hash
    should_download = True
    if tar_path.exists():
        try:
            tar_hash = hashlib.sha256(tar_path.read_bytes()).hexdigest()
            if tar_hash == expected_hash:
                print("qdrant archive is up to date")
                should_download = False
            else:
                print("qdrant archive has wrong hash, redownloading...")
        except Exception as e:
            print(f"Warning: Could not verify tar hash: {e}, redownloading...")

    # Download if needed
    if should_download:
        print(f"Downloading {asset['name']}...")
        try:
            with urllib.request.urlopen(asset["browser_download_url"]) as resp:
                tar_data = resp.read()
        except Exception as e:
            raise RuntimeError(f"Failed to download qdrant: {e}")

        # Verify hash
        if expected_hash:
            actual_hash = hashlib.sha256(tar_data).hexdigest()
            if actual_hash != expected_hash:
                raise RuntimeError(
                    f"qdrant hash mismatch: expected {expected_hash}, got {actual_hash}"
                )
            print("Hash verified")

        tar_path.write_bytes(tar_data)

    # Extract binary (always extract to ensure it matches the tar)
    with tarfile.open(tar_path, "r:gz") as tar:
        tar.extract(member="qdrant", path=build_dir, filter="data")
    print("qdrant binary extracted successfully")


# Fix taken from glyph/Encrust@5891220
# workaround for ronaldoussoren/py2app#560
class Py2AppIgnoringDependencies(py2app):  # type: ignore[misc]
    def finalize_options(self) -> None:
        self.distribution.install_requires = []
        super().finalize_options()

    def run(self) -> None:
        """Build the frontend before building the app."""
        frontend_dir = HERE.parent / "frontend"

        print("Installing frontend dependencies...")
        result = subprocess.run(
            ["npm", "install"],
            cwd=frontend_dir,
            capture_output=False,
        )
        if result.returncode != 0:
            raise RuntimeError(f"npm install failed with return code {result.returncode}")

        print("Building frontend...")
        result = subprocess.run(
            ["npm", "run", "build"],
            cwd=frontend_dir,
            capture_output=False,
        )
        if result.returncode != 0:
            raise RuntimeError(f"Frontend build failed with return code {result.returncode}")
        if not FRONTEND_DIST.exists():
            raise RuntimeError(f"Frontend build succeeded but dist not found at {FRONTEND_DIST}")
        print("Frontend built successfully")

        # Download qdrant binary
        build_dir = HERE / "build"
        _download_qdrant(build_dir)

        # Compile assets catalog
        xcassets = HERE.parent / "icon" / "Media.xcassets"
        assets_car = build_dir / "Assets.car"
        if xcassets.exists():
            build_dir.mkdir(parents=True, exist_ok=True)
            print("Compiling assets catalog...")
            result = subprocess.run(
                [
                    "xcrun",
                    "actool",
                    "--compile",
                    str(assets_car.parent),
                    "--platform",
                    "macosx",
                    "--minimum-deployment-target",
                    "13.0",
                    "--app-icon",
                    "AppIcon",
                    "--output-partial-info-plist",
                    str(HERE / "build" / "partial.plist"),
                    str(xcassets),
                ],
                capture_output=False,
            )
            if result.returncode != 0:
                raise RuntimeError(f"Asset compilation failed with return code {result.returncode}")
            print("Assets compiled successfully")

        super().run()

setup(
    name="Writing Anima",
    app=["desktop.py"],
    options={"py2app": OPTIONS},  # type: ignore[dict-item]
    cmdclass={"py2app": Py2AppIgnoringDependencies},
)
