#!/usr/bin/env python3
"""Dev-palvelin ilman välimuistia.

Käyttö:  python dev-server.py  (portti 8000)
         python dev-server.py 3000  (oma portti)

Lähettää jokaiseen vastaukseen no-store -otsakkeet, joten selain ei
tallenna tiedostoja välimuistiin -> muutokset näkyvät heti (F5 riittää).
"""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Dev-palvelin (ei välimuistia) -> http://localhost:{port}/")
    ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
