/* Twingo Racer VS room relay — core logic, embeddable.
 *
 * Used two ways:
 *   - embedded in the app's custom server (root server.js), mounted on the
 *     /race-relay upgrade path — same origin, same port, no second service
 *   - standalone via server/race-server.mjs (local dev / tests / anyone who
 *     wants a separate process on :8787)
 *
 * What it does: room membership keyed by the 4-char code (max 5 peers,
 * matching client MAX_RACERS) and nothing else. Every client message is
 * relayed verbatim to the other peers in the room, tagged with the sender
 * id. No auth, no persistence, no game logic — leader election, seed
 * authority, validation and interpolation all stay client-side (see
 * components/retro/racer/net.ts), so this server is a dumb pipe that can
 * be killed and restarted without losing anything but the live room.
 *
 * Wire shape (JSON text frames):
 *   client → server: {a: action, d: payload}
 *     a ∈ hello|start|st|take|hole|chit|dead|rematch|bots|bst  (mirror of
 *     net.ts actions; "st" is the per-frame car state, the hot path)
 *   server → client (relay): {a, d, from}
 *   server → client (membership): {a: "peers", d: [{id, ...hello}], you}
 *     sent to the joiner on entry and to everyone on join/leave/hello —
 *     "you" is the RECIPIENT's own server id (a client cannot infer which
 *     roster row is itself), clients derive the leader from joinedAt
 *     exactly like today
 *   server → client (errors): {a: "error", d: "ROOM_FULL" | "BAD_CODE"}
 *
 * Hardening: ws `maxPayload` = MAX_MSG, so a frame over 4 KB gets the whole
 * connection closed with code 1009 (message too big) instead of the old
 * silent drop — small garbage JSON is still tolerated. The ping loop does
 * standard ws liveness: isAlive=false before each ping, pong flips it back,
 * still false on the next tick → terminate (half-open zombies would squat
 * a room slot forever). PING_MS env overrides the 20 s interval for tests.
 *
 * Why WebSocket beats the Nostr/WebRTC mesh for this game: Trystero pays
 * ~50-150 ms one-way relay latency through public relays plus connection
 * setup; a direct WS room is a single hop at ~5-20 ms, so the 60 Hz state
 * stream lands denser, the interpolation buffer extrapolates less and the
 * spectator camera glides instead of catching up.
 *
 * CJS because the root custom server (server.js) is CJS; the standalone
 * ESM wrapper imports this file's default export.
 */
const { WebSocketServer } = require("ws");

const MAX_PEERS = 5; // client MAX_RACERS
const CODE_RE = /^[A-Z2-9]{4}$/; // superset of the client's look-alike-free alphabet — fine, clients never emit I/O/0/1
const MAX_MSG = 4096; // st packets are ~60 B; nothing legit comes near this
const PING_MS = Number.parseInt(process.env.PING_MS ?? "20000", 10);

const createRelay = () => {
  const rooms = new Map(); // code → Map<peerId, {ws, hello}>

  const send = (ws, a, d, from, you) => {
    if (ws.readyState === ws.OPEN)
      ws.send(
        JSON.stringify({
          a,
          d,
          ...(from === undefined ? {} : { from }),
          ...(you === undefined ? {} : { you }),
        }),
      );
  };
  const broadcast = (room, exceptId, a, d, from) => {
    for (const [id, p] of room) if (id !== exceptId) send(p.ws, a, d, from);
  };
  const emitPeers = (room) => {
    const peers = [...room.entries()].map(([id, p]) => ({ id, ...p.hello }));
    peers.sort((x, y) => x.joinedAt - y.joinedAt);
    for (const [id, p] of room) send(p.ws, "peers", peers, undefined, id);
  };

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG });
  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://x");
    const code = (url.searchParams.get("room") ?? "").toUpperCase();
    if (!CODE_RE.test(code)) return send(ws, "error", "BAD_CODE"), ws.close();
    let room = rooms.get(code);
    if (!room) rooms.set(code, (room = new Map()));
    if (room.size >= MAX_PEERS)
      return send(ws, "error", "ROOM_FULL"), ws.close();

    let id = `ws-${Math.random().toString(36).slice(2, 10)}`;
    while (room.has(id)) id = `ws-${Math.random().toString(36).slice(2, 10)}`;
    let hello = null;
    room.set(id, { ws, hello });
    // roster to the joiner right away (empty or not), like Trystero's sync:
    // the client shows itself alone-in-room immediately instead of waiting
    emitPeers(room);
    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg.a !== "string") return;
      if (msg.a === "hello") {
        hello = msg.d; // first hello is the RaceHello (name/seed/joinedAt/ready)
        room.get(id).hello = hello;
        emitPeers(room);
        return;
      }
      if (msg.a === "peers" || msg.a === "error") return; // server-owned
      broadcast(room, id, msg.a, msg.d, id);
    });

    const drop = () => {
      if (!room.has(id)) return;
      room.delete(id);
      if (room.size === 0) rooms.delete(code);
      else emitPeers(room);
    };
    ws.on("close", drop);
    ws.on("error", drop);
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });
    const ping = setInterval(() => {
      if (ws.readyState !== ws.OPEN) return clearInterval(ping);
      if (!ws.isAlive) return ws.terminate(); // missed a pong → zombie, drop it
      ws.isAlive = false;
      ws.ping();
    }, PING_MS);
    ws.on("close", () => clearInterval(ping));
  });

  return {
    handleUpgrade: (req, socket, head) =>
      wss.handleUpgrade(req, socket, head, (ws) =>
        wss.emit("connection", ws, req),
      ),
  };
};

module.exports = { createRelay };
