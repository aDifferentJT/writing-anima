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

import subprocess
import sys
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
    ],
    "plist": {
        "CFBundleName": "Writing Anima",
        "CFBundleDisplayName": "Writing Anima",
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
        super().run()

setup(
    name="Writing Anima",
    app=["desktop.py"],
    options={"py2app": OPTIONS},  # type: ignore[dict-item]
    cmdclass={"py2app": Py2AppIgnoringDependencies},
)
