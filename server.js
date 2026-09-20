/* Custom Next.js server: serves the app AND embeds the Twingo Racer VS
 * relay on the /race-relay upgrade path — same origin, same port, no second
 * service or extra TLS to deploy. NEXT_PUBLIC_RACE_SERVER stays as an
 * optional override for anyone hosting the relay elsewhere.
 *
 * `npm run dev` and the production Docker image both boot through this file
 * (the image runs Next in full mode with production node_modules).
 * In dev we must NOT touch non-relay upgrade sockets — Next's HMR owns
 * those; in production nothing else listens, so unknown upgrades die.
 */
const { createServer } = require("node:http");
const next = require("next");
const { createRelay } = require("./server/race-relay-core.cjs");

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? (dev ? "localhost" : "0.0.0.0");

const app = next({ dev, turbopack: true });
const handle = app.getRequestHandler();
const relay = createRelay();

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));
  server.on("upgrade", (req, socket, head) => {
    const path = new URL(req.url ?? "/", "http://x").pathname.replace(
      /\/+$/,
      "",
    );
    if (path === "/race-relay") return relay.handleUpgrade(req, socket, head);
    if (!dev) socket.destroy();
  });
  server.listen(port, hostname, () => {
    console.log(`[race] app + /race-relay relay on http://${hostname}:${port}`);
  });
});
