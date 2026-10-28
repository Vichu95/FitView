import threading

import pytest

from fitview import server
from fitview.library import ensure_workspace


@pytest.fixture
def workspace(tmp_path):
    """A fresh workspace (library workbook + example plans) the server points at."""
    server.configure(tmp_path)
    ensure_workspace(tmp_path)
    return tmp_path


@pytest.fixture
def live_server(workspace):
    """The real HTTP server on a free port, for end-to-end API tests."""
    httpd, port = server.make_server(18765, tries=50)
    server.PORT = port
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}"
    httpd.shutdown()
    httpd.server_close()
