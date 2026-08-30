// TrueForge's hosted-mode API sends no CORS headers at all (verified live —
// no Access-Control-Allow-Origin under any Origin, even its own). A browser
// on a different origin (this cockpit's own Cloud Run URL) can't call it
// directly: session/turn creation is blocked before it ever reaches the
// server. Proxying /api/* server-side keeps the browser same-origin — no
// CORS involved — while everything else is served as a plain static SPA.
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRUEFORGE_TARGET = process.env.TRUEFORGE_BASE_URL;
if (!TRUEFORGE_TARGET) {
  throw new Error("TRUEFORGE_BASE_URL is not set — the /api proxy has nowhere to forward to.");
}

const app = express();

// Two path-stripping traps here, both confirmed live before landing on this:
// (1) app.use("/api", proxy) makes Express strip "/api" from req.url before
//     the proxy ever sees it — turned /api/v1/sessions into /v1/sessions.
// (2) Mounting at root with `pathFilter: "/api"` instead does NOT avoid this
//     in http-proxy-middleware v3 — pathFilter still stripped the match.
// The fix that's actually documented (and now verified): keep the app.use
// mount-path stripping, but bake "/api" back into the target so the two
// cancel out, exactly like the library's own README example does.
app.use(
  "/api",
  createProxyMiddleware({
    target: `${TRUEFORGE_TARGET}/api`,
    changeOrigin: true,
    ws: true,
  }),
);

app.use(express.static(path.join(__dirname, "dist")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`recoup-cockpit listening on :${String(port)}, proxying /api -> ${TRUEFORGE_TARGET}`);
});
