/* Standalone entry for the VS room relay — the same logic that the app's
 * own server embeds on /race-relay (see race-relay-core.cjs for the docs),
 * wrapped in a plain http server on :8787 for local dev and tests. In
 * production you normally don't run this: the site serves the relay itself.
 */
import { createServer } from "node:http";
import pkg from "./race-relay-core.cjs";

const { createRelay } = pkg;
const PORT = Number(process.env.PORT ?? 8787);
const relay = createRelay();

const server = createServer((_req, res) => {
  res.writeHead(426, { "content-type": "text/plain" });
  res.end("websocket endpoint — see race-relay-core.cjs\n");
});
server.on("upgrade", (req, socket, head) => relay.handleUpgrade(req, socket, head));
server.listen(PORT, () => console.log(`[race] ws relay on :${PORT}`));
