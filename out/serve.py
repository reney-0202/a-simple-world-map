# -*- coding: utf-8 -*-
"""world1980 static server: serves out/ on 127.0.0.1 and opens the browser."""
import http.server
import functools
import os
import socket
import sys
import threading
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
PORTS = [8815, 8816, 8817, 8818, 8820, 8822]
# verification / automation runs must never pop up a browser window:
#   python serve.py --no-browser      (or set W1980_NO_BROWSER=1)
NO_BROWSER = ("--no-browser" in sys.argv) or (os.environ.get("W1980_NO_BROWSER") == "1")


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


def pick_port():
    for p in PORTS:
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", p))
                return p
            except OSError:
                continue
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main():
    port = pick_port()
    url = "http://127.0.0.1:%d/index.html" % port
    handler = functools.partial(Handler, directory=ROOT)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    print("1980 world map  ->  %s" % url)
    print("按 Ctrl+C 结束服务")
    if not NO_BROWSER:
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    else:
        print("(--no-browser: 不自动打开浏览器)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")
        sys.exit(0)


if __name__ == "__main__":
    main()
