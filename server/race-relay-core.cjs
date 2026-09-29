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
 *   server → client (session): {a: "session", d: {token}}
 *     once per connection, right after entry — the resume credential.
 *     Reconnecting clients pass ?room=CODE&resume=<peerId>&token=<token>:
 *     a match within the grace window restores the same id AND the stored
 *     hello (original joinedAt/racing — the lobby lead and a live race
 *     survive a reconnect); a mismatch/expiry is a plain fresh join
 *   server → client (policy close): {a: "closed", d: reason}
 *     sent BEFORE the socket is closed when the server ends things on
 *     purpose — reason ∈ "IDLE" (no traffic for RACE_IDLE_MS) | "EXPIRED"
 *     (room hit RACE_MAX_AGE_MS) | "RATE_LIMITED" | "SERVER_FULL". Clients
 *     must NOT auto-reconnect after this; a bare transport drop (deploy,
 *     network) carries no such message and IS reconnectable
 *   server → client (errors): {a: "error", d: "ROOM_FULL" | "BAD_CODE"}
 *
 * Room lifecycle: a room dies when its last live socket closes (as
 * always), when it idles (no message from anyone for RACE_IDLE_MS,
 * default 15 min — parked tabs can't squat a code forever) or when it
 * hits the absolute RACE_MAX_AGE_MS (default 4 h). A periodic sweep
 * (SWEEP_MS, default 30 s) reaps all three plus expired resume stubs.
 *
 * Hardening: ws `maxPayload` = MAX_MSG, so a frame over 4 KB gets the
 * whole connection closed with code 1009 (message too big). The ping loop
 * does standard ws liveness: isAlive=false before each ping, pong flips
 * it back, still false on the next tick → terminate (half-open zombies
 * would squat a room slot forever). A socket that never sends hello
 * within RACE_HELLO_MS (10 s) is terminated. Every socket rides a token
 * bucket (RACE_MSG_RATE 300/s sustained, RACE_MSG_BURST 600 — the legit
 * peak is ~140 msg/s: 60 Hz st + four 20 Hz bot streams from the leader),
 * past which it is RATE_LIMITED-closed. Caps: RACE_MAX_ROOMS (500) live
 * rooms and RACE_MAX_CONN_PER_IP (10) live sockets per client IP
 * (x-forwarded-for's first hop, else the socket address). Every constant
 * is an env override for tests. One-line logs on room create/close, peer
 * join/resume/leave and policy terminations.
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
const { randomBytes } = require("node:crypto");
const { WebSocketServer } = require("ws");

const int = (name, fallback) => {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

const MAX_PEERS = 5; // client MAX_RACERS
const CODE_RE = /^[A-Z2-9]{4}$/; // superset of the client's look-alike-free alphabet — fine, clients never emit I/O/0/1
const MAX_MSG = 4096; // st packets are ~60 B; nothing legit comes near this
const PING_MS = int("PING_MS", 20000);
const SWEEP_MS = int("SWEEP_MS", 30000);
const HELLO_MS = int("RACE_HELLO_MS", 10000);
const IDLE_MS = int("RACE_IDLE_MS", 15 * 60 * 1000);
const MAX_AGE_MS = int("RACE_MAX_AGE_MS", 4 * 3600 * 1000);
const RESUME_MS = int("RACE_RESUME_MS", 60000);
const MAX_ROOMS = int("RACE_MAX_ROOMS", 500);
const MAX_CONN_PER_IP = int("RACE_MAX_CONN_PER_IP", 10);
const MSG_RATE = int("RACE_MSG_RATE", 300); // sustained msgs/s per socket
const MSG_BURST = int("RACE_MSG_BURST", 600);

const log = (...args) => console.log("[race]", ...args);

const createRelay = () => {
  // code → {
  //   peers: Map<peerId, {ws, hello, token, ip}>,
  //   createdAt, lastActivity,
  //   gone: Map<peerId, {hello, token, leftAt}>  — resumable stubs
  // }
  const rooms = new Map();
  const ipCounts = new Map(); // ip → live socket count

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
    for (const [id, p] of room.peers)
      if (id !== exceptId) send(p.ws, a, d, from);
  };
  const emitPeers = (room) => {
    const peers = [...room.peers.entries()].map(([id, p]) => ({
      id,
      ...p.hello,
    }));
    peers.sort((x, y) => x.joinedAt - y.joinedAt);
    for (const [id, p] of room.peers) send(p.ws, "peers", peers, undefined, id);
  };

  const clientIp = (req) => {
    const fwd = req.headers["x-forwarded-for"];
    if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
    return req.socket.remoteAddress ?? "?";
  };
  const decIp = (ip) => {
    const n = (ipCounts.get(ip) ?? 1) - 1;
    if (n <= 0) ipCounts.delete(ip);
    else ipCounts.set(ip, n);
  };

  /* close() alone can hang in CLOSING forever if the peer never answers
     the close frame — guarantee the drop with a terminate fallback */
  const closeHard = (ws, code, reason) => {
    ws.close(code, reason);
    const t = setTimeout(() => {
      if (ws.readyState !== ws.CLOSED) ws.terminate();
    }, 5000);
    t.unref?.();
  };

  /* policy close: tell the client WHY (and that it must not reconnect)
     before the socket goes away */
  const policyClose = (ws, reason) => {
    send(ws, "closed", reason);
    closeHard(ws, 1000, reason);
  };

  const closeRoom = (code, room, reason) => {
    rooms.delete(code);
    for (const [, p] of room.peers) policyClose(p.ws, reason);
    log(
      `room ${code} closed (${reason}, peers=${room.peers.size}, age=${Math.round(
        (Date.now() - room.createdAt) / 1000,
      )}s)`,
    );
  };

  /* room hygiene sweep: idle TTL, absolute max age, resume-grace expiry */
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      for (const [id, g] of room.gone)
        if (now - g.leftAt > RESUME_MS) room.gone.delete(id);
      if (now - room.lastActivity > IDLE_MS) closeRoom(code, room, "IDLE");
      else if (now - room.createdAt > MAX_AGE_MS)
        closeRoom(code, room, "EXPIRED");
    }
  }, SWEEP_MS);
  sweep.unref?.();

  const freshId = (room) => {
    let id;
    do {
      id = `ws-${randomBytes(6).toString("base64url")}`;
    } while (room.peers.has(id) || room.gone.has(id));
    return id;
  };

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG });
  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://x");
    const code = (url.searchParams.get("room") ?? "").toUpperCase();
    if (!CODE_RE.test(code)) return send(ws, "error", "BAD_CODE"), closeHard(ws);
    const ip = clientIp(req);
    if ((ipCounts.get(ip) ?? 0) >= MAX_CONN_PER_IP)
      return policyClose(ws, "SERVER_FULL");

    let room = rooms.get(code);
    /* session resume: a dropped peer reclaims its id + stored hello
       (original joinedAt/racing) inside the grace window — the lobby lead
       and a live race survive the reconnect. No match = plain fresh join */
    const resumeId = url.searchParams.get("resume") ?? "";
    const resumeTok = url.searchParams.get("token") ?? "";
    const stub = room?.gone.get(resumeId);
    const resuming = !!(stub && resumeTok && stub.token === resumeTok);
    if (!room) {
      if (rooms.size >= MAX_ROOMS) return policyClose(ws, "SERVER_FULL");
      rooms.set(
        code,
        (room = {
          peers: new Map(),
          createdAt: Date.now(),
          lastActivity: Date.now(),
          gone: new Map(),
        }),
      );
      log(`room ${code} created (${rooms.size} live)`);
    }
    // a resume takes its own slot back, so it bypasses the capacity check
    if (!resuming && room.peers.size >= MAX_PEERS)
      return send(ws, "error", "ROOM_FULL"), closeHard(ws);

    const id = resuming ? resumeId : freshId(room);
    const token = resuming ? stub.token : randomBytes(12).toString("base64url");
    if (resuming) room.gone.delete(resumeId);
    const peer = { ws, hello: resuming ? stub.hello : null, token, ip };
    room.peers.set(id, peer);
    room.lastActivity = Date.now();
    ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);
    send(ws, "session", { token }); // the resume credential, once per entry
    // roster to everyone right away (the joiner included), like Trystero's
    // sync: the client shows the room immediately instead of waiting
    emitPeers(room);
    log(
      `peer ${id} ${resuming ? "resumed" : "joined"} ${code} (${room.peers.size} live)`,
    );

    /* hello deadline: a socket that never introduces itself squats a slot */
    const helloTimer = setTimeout(() => {
      if (!peer.hello && ws.readyState === ws.OPEN) {
        log(`peer ${id} hello timeout — terminated`);
        ws.terminate();
      }
    }, HELLO_MS);
    helloTimer.unref?.();

    /* per-socket token bucket against floods (counted on the raw frame,
       before paying the JSON parse) */
    let bucket = MSG_BURST;
    let lastRefill = Date.now();
    let throttled = false;

    ws.on("message", (raw) => {
      if (throttled) return;
      const now = Date.now();
      bucket = Math.min(
        MSG_BURST,
        bucket + ((now - lastRefill) * MSG_RATE) / 1000,
      );
      lastRefill = now;
      if (bucket < 1) {
        throttled = true;
        log(`peer ${id} rate-limited — closed`);
        return policyClose(ws, "RATE_LIMITED");
      }
      bucket--;
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg.a !== "string") return;
      room.lastActivity = Date.now();
      if (msg.a === "hello") {
        peer.hello = msg.d; // first hello is the RaceHello (name/seed/joinedAt/ready)
        emitPeers(room);
        return;
      }
      // server-owned actions must not be relayed
      if (
        msg.a === "peers" ||
        msg.a === "error" ||
        msg.a === "closed" ||
        msg.a === "session"
      )
        return;
      broadcast(room, id, msg.a, msg.d, id);
    });

    const drop = () => {
      if (!room.peers.has(id)) return;
      room.peers.delete(id);
      decIp(ip);
      clearTimeout(helloTimer);
      /* keep a resumable stub for the grace window — the car just faded on
         the other screens; a quick reconnect brings it back as-is. A peer
         that never sent hello has nothing worth restoring */
      if (peer.hello) {
        room.gone.set(id, { hello: peer.hello, token, leftAt: Date.now() });
        if (room.gone.size > MAX_PEERS)
          room.gone.delete(room.gone.keys().next().value);
      }
      log(`peer ${id} left ${code} (${room.peers.size} live)`);
      // last live socket gone → the room (and its resume stubs) dies
      if (room.peers.size === 0) rooms.delete(code);
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
    ping.unref?.();
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
