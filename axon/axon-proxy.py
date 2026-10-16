#!/usr/bin/env python3
"""
Portero de Axón: protege tu Ollama con una clave.

Sin esto, cualquiera que conozca la dirección del túnel (trycloudflare.com)
puede usar tu portátil como IA gratis. Con esto, solo responde a quien
envíe tu clave secreta (la app FitPulse la manda sola).

Uso (Windows o Linux, solo necesita Python 3):
    python axon-proxy.py TU_CLAVE_SECRETA
y abre el túnel hacia el portero en vez de hacia Ollama:
    cloudflared tunnel --url http://localhost:8787
"""
import hmac, json, sys, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

if len(sys.argv) < 2 or len(sys.argv[1]) < 12:
    sys.exit("Pon una clave de al menos 12 caracteres:  python axon-proxy.py MiClaveLarga2026")
KEY = sys.argv[1].encode()
OLLAMA = "http://127.0.0.1:11434"
ORIGIN = "https://aaapruebaaa67-source.github.io"
ALLOWED = {("GET", "/api/tags"), ("POST", "/api/chat")}
MAX_BODY = 64 * 1024          # 64 KB por mensaje
LIMIT, WINDOW = 30, 60        # 30 peticiones por minuto
hits = []

class Portero(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", ORIGIN)
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Axon-Key")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Vary", "Origin")

    def _err(self, code, msg):
        body = json.dumps({"error": msg}).encode()
        self.send_response(code); self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body))); self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def _handle(self, method):
        if (method, self.path) not in ALLOWED:
            return self._err(404, "ruta no permitida")
        if not hmac.compare_digest(self.headers.get("X-Axon-Key", "").encode(), KEY):
            return self._err(401, "clave incorrecta")
        now = time.time()
        hits[:] = [t for t in hits if now - t < WINDOW]
        if len(hits) >= LIMIT:
            return self._err(429, "demasiadas peticiones")
        hits.append(now)
        data = None
        if method == "POST":
            n = int(self.headers.get("Content-Length", "0") or 0)
            if n > MAX_BODY:
                return self._err(413, "mensaje demasiado grande")
            data = self.rfile.read(n)
        req = urllib.request.Request(OLLAMA + self.path, data=data, method=method,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                body, code = r.read(), r.status
        except urllib.error.HTTPError as e:
            body, code = e.read(), e.code
        except Exception:
            return self._err(502, "Ollama no responde: ¿está abierto?")
        self.send_response(code); self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body))); self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  self._handle("GET")
    def do_POST(self): self._handle("POST")
    def log_message(self, fmt, *a):
        print(time.strftime("%H:%M:%S"), self.command, self.path, "->", a[1] if len(a) > 1 else "")

print("Portero de Axón escuchando en http://localhost:8787  (Ctrl+C para parar)")
ThreadingHTTPServer(("127.0.0.1", 8787), Portero).serve_forever()
