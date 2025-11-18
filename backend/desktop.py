"""Desktop entry point — wraps the FastAPI app in a native window via pywebview."""

# Inside a macOS .app bundle the locale is unset, so open() calls without an
# explicit encoding= fall back to ASCII.  Setting LC_CTYPE fixes this properly.
import locale
locale.setlocale(locale.LC_CTYPE, "UTF-8")

import ipaddress
import logging
import ssl
import sys
import tempfile
import threading
import time
import traceback
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import uvicorn
import webview
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

from main import setup
from src import global_init

PORT = 8000
URL = f"https://127.0.0.1:{PORT}"


def _generate_cert() -> tuple[bytes, bytes]:
    """Generate a short-lived self-signed cert + key for localhost."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(hours=24))
        .add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName("localhost"),
                x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
            ]),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )
    return (
        cert.public_bytes(serialization.Encoding.PEM),
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ),
    )


def _wait_for_server(timeout: float = 30.0) -> None:
    # Skip TLS verification for the internal health-check poll — the cert is
    # self-signed and the point here is just to wait until uvicorn is listening.
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f"{URL}/api/health", timeout=1, context=ctx)
            return
        except Exception:
            time.sleep(0.1)
    raise RuntimeError(f"Server did not start within {timeout}s")


def main() -> None:
    try:
        global_init.run()

    except Exception as e:
        print(f"Startup error: {e}")
        traceback.print_exc()

        # Load error page and replace placeholders
        dist_dir = Path(__file__).parent.parent / "frontend" / "dist"
        html_content = (dist_dir / "error.html").read_text()
        html_content = html_content.replace("~ERROR_TYPE~", type(e).__name__)
        html_content = html_content.replace("~ERROR_MESSAGE~", str(e))
        html_content = html_content.replace("~TRACEBACK~", traceback.format_exc())

        window = webview.create_window(
            "Writing Anima - Error",
            html=html_content,
            width=1400,
            height=900,
            min_size=(800, 600),
        )

        webview.start()

    else:
        fastapi_app = setup([URL])
    
        cert_pem, key_pem = _generate_cert()
    
        with (
            tempfile.NamedTemporaryFile(suffix=".pem") as cert_file,
            tempfile.NamedTemporaryFile(suffix=".pem") as key_file,
        ):
            cert_path = cert_file.name
            key_path = key_file.name
            cert_file.write(cert_pem)
            key_file.write(key_pem)
            cert_file.flush()
            key_file.flush()
    
            config = uvicorn.Config(
                fastapi_app,
                host="127.0.0.1",
                port=PORT,
                log_level="warning",
                ssl_certfile=cert_path,
                ssl_keyfile=key_path,
            )
            server = uvicorn.Server(config)
    
            threading.Thread(target=server.run, daemon=True).start()
            _wait_for_server()
    
            class JsApi:
                def __init__(self) -> None:
                    self._anima_window: webview.Window | None = None
                    self._settings_window: webview.Window | None = None
                    self.main_window = webview.create_window(
                        "Writing Anima",
                        URL,
                        width=1400,
                        height=900,
                        min_size=(800, 600),
                        js_api=self,
                    )

                def open_anima_manager(self) -> None:
                    if self._anima_window is None:
                        win = webview.create_window(
                            "Anima Manager",
                            f"{URL}/animas",
                            width=1200,
                            height=800,
                            min_size=(800, 600),
                            js_api=self,
                        )
                        if win is not None:
                            def _on_closed() -> None:
                                self._anima_window = None
                            win.events.closed += _on_closed
                            self._anima_window = win
                    if self._anima_window is not None:
                        self._anima_window.show()

                def open_settings(self) -> None:
                    if self._settings_window is None:
                        win = webview.create_window(
                            "Settings",
                            f"{URL}/settings",
                            width=1000,
                            height=700,
                            min_size=(700, 500),
                            js_api=self,
                        )
                        if win is not None:
                            def _on_settings_closed() -> None:
                                self._settings_window = None
                            win.events.closed += _on_settings_closed
                            self._settings_window = win
                    if self._settings_window is not None:
                        self._settings_window.show()

                def refresh_all_pages(self) -> None:
                    if self.main_window is not None:
                        self.main_window.run_js("location.reload()")
                    if self._anima_window is not None:
                        self._anima_window.run_js("location.reload()")
                    if self._settings_window is not None:
                        self._settings_window.run_js("location.reload()")

            js_api = JsApi()

            menu = [
                webview.menu.Menu(
                    "__app__",
                    [
                        webview.menu.MenuAction("Animas", js_api.open_anima_manager),
                        webview.menu.MenuAction("Settings", js_api.open_settings),
                        webview.menu.MenuAction("Refresh", js_api.refresh_all_pages),
                    ],
                )
            ]

            webview.start(ssl=True, menu=menu)


if __name__ == "__main__":
    main()
