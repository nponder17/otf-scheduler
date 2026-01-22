const http = require("http");
const httpProxy = require("http-proxy");

const API_TARGET = "http://127.0.0.1:8000";
const WEB_TARGET = "http://127.0.0.1:8081"; // Expo web dev server
const LISTEN_PORT = 8082;

const proxy = httpProxy.createProxyServer({
  ws: true,
  changeOrigin: true,
});

proxy.on("error", (err, req, res) => {
  console.error("❌ Proxy error:", err?.message);
  console.error("   URL:", req?.url);
  // Avoid crashing + respond cleanly
  try {
    if (res && !res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain" });
    }
    res.end("Bad gateway (dev proxy). Check that API and WEB servers are running.");
  } catch {}
});

function isApiRoute(url = "") {
  return (
    url.startsWith("/employees") ||
    url.startsWith("/companies") ||
    url.startsWith("/admin") ||
    url.startsWith("/schedules") ||
    url.startsWith("/health") ||
    url.startsWith("/docs") ||
    url.startsWith("/openapi.json")
  );
}

const server = http.createServer((req, res) => {
  // Log every request so we can see what triggers the crash
  console.log(`${req.method} ${req.url}`);

  // (This header DOES help for fetch/XHR, but doesn't prevent the initial Safari interstitial)
  req.headers["ngrok-skip-browser-warning"] = "1";

  const target = isApiRoute(req.url || "") ? API_TARGET : WEB_TARGET;

  if (!target || !/^https?:\/\//.test(target)) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(`Invalid proxy target: "${target}"`);
    return;
  }

  proxy.web(req, res, { target });
});

server.on("upgrade", (req, socket, head) => {
  req.headers["ngrok-skip-browser-warning"] = "1";
  const target = isApiRoute(req.url || "") ? API_TARGET : WEB_TARGET;
  proxy.ws(req, socket, head, { target });
});

server.listen(LISTEN_PORT, "0.0.0.0", () => {
  console.log("✅ Dev proxy running");
  console.log(`   http://localhost:${LISTEN_PORT}`);
  console.log("   API →", API_TARGET);
  console.log("   WEB →", WEB_TARGET);
});
