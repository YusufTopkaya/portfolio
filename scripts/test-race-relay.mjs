/* Race relay lifecycle tests — boots server/race-relay-core.cjs in-process
 * on an ephemeral port with fast env clocks and drives real WebSocket
 * clients at it: membership, ROOM_FULL/BAD_CODE, hello deadline, idle TTL,
 * session resume (token, wrong token, grace expiry), rate limiting and the
 * last-socket-closes-room rule.
 *
 *   node scripts/test-race-relay.mjs
 */
import { createServer } from "node:http";
import assert from "node:assert/strict";

// env is read at module load — set it BEFORE importing the core
process.env.PING_MS = "60000"; // keep the liveness loop out of timing tests
process.env.SWEEP_MS = "100";
process.env.RACE_HELLO_MS = "300";
process.env.RACE_IDLE_MS = "900";
process.env.RACE_MAX_AGE_MS = "60000";
process.env.RACE_RESUME_MS = "600";
process.env.RACE_MAX_CONN_PER_IP = "50";
process.env.RACE_MSG_RATE = "100";
process.env.RACE_MSG_BURST = "200";

const { default: pkg } = await import("../server/race-relay-core.cjs");
const { createRelay } = pkg;
const { WebSocket } = await import("ws");

const relay = createRelay();
const server = createServer((_req, res) => {
  res.writeHead(426).end();
});
server.on("upgrade", (req, socket, head) =>
  relay.handleUpgrade(req, socket, head),
);
await new Promise((res) => server.listen(0, "127.0.0.1", res));
const port = server.address().port;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hello = (name) => ({
  name,
  seed: 1,
  joinedAt: Date.now(),
  ready: false,
});

/** a connected test client with a message log and a predicate waiter */
const open = (query) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/race-relay/?room=${query}`,
    );
    const msgs = [];
    const waiters = [];
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      msgs.push(m);
      for (let i = waiters.length - 1; i >= 0; i--)
        if (waiters[i].pred(m)) {
          waiters[i].resolve(m);
          waiters.splice(i, 1);
        }
    });
    ws.on("open", () =>
      resolve({
        ws,
        msgs,
        wait: (pred, ms = 3000) => {
          const seen = msgs.find(pred);
          if (seen) return Promise.resolve(seen);
          return new Promise((res, rej) => {
            const w = { pred, resolve: res };
            waiters.push(w);
            setTimeout(() => {
              const i = waiters.indexOf(w);
              if (i < 0) return;
              waiters.splice(i, 1);
              rej(new Error(`wait timeout — got ${JSON.stringify(msgs)}`));
            }, ms);
          });
        },
        send: (a, d) => ws.send(JSON.stringify({ a, d })),
        closed: new Promise((res) => ws.on("close", res)),
      }),
    );
    ws.on("error", reject);
  });

const live = []; // every client, for the per-test cleanup
const join = async (room, name, extra = "") => {
  const c = await open(`${room}${extra}`);
  live.push(c);
  const first = await c.wait((m) => m.a === "peers");
  const session = await c.wait((m) => m.a === "session");
  if (name) {
    c.send("hello", hello(name));
    await c.wait((m) => m.a === "peers" && m.d.some((p) => p.name === name));
  }
  return { ...c, id: first.you, token: session.d.token };
};

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("join delivers roster + session, hello broadcasts", async () => {
  const a = await join("BASE", "AL");
  assert.equal(typeof a.id, "string");
  assert.ok(a.id.startsWith("ws-"));
  assert.equal(typeof a.token, "string");
  assert.ok(a.token.length >= 8);
  const b = await join("BASE", "BO");
  // A sees B arrive
  await a.wait(
    (m) => m.a === "peers" && m.d.length === 2 && m.d[1].name === "BO",
  );
  assert.equal(b.id === a.id, false);
});

test("BAD_CODE rejected", async () => {
  const c = await open("AB!D");
  live.push(c);
  const err = await c.wait((m) => m.a === "error");
  assert.equal(err.d, "BAD_CODE");
});

test("ROOM_FULL at the 6th peer", async () => {
  for (let i = 1; i <= 5; i++) await join("FULL", `P${i}`);
  const sixth = await open("FULL");
  live.push(sixth);
  const err = await sixth.wait((m) => m.a === "error");
  assert.equal(err.d, "ROOM_FULL");
});

test("hello deadline terminates a silent socket", async () => {
  const c = await open("NOHL");
  live.push(c);
  await c.wait((m) => m.a === "peers"); // entry roster still arrives
  const code = await Promise.race([c.closed, sleep(2000).then(() => null)]);
  assert.equal(code, 1006); // terminate() = abnormal closure
});

test("idle TTL closes the room with IDLE", async () => {
  const a = await join("IDLE", "AL");
  const msg = await a.wait((m) => m.a === "closed", 3000);
  assert.equal(msg.d, "IDLE");
  await a.closed; // the socket follows the notice
});

test("resume restores id + original hello; wrong token is a fresh join", async () => {
  const a = await join("RESU", "AL");
  const b = await join("RESU", "BO");
  const oldId = a.id;
  const oldJoinedAt = a.msgs.find(
    (m) => m.a === "peers" && m.d.some((p) => p.id === oldId && p.name),
  ).d[0].joinedAt;
  a.ws.close();
  await b.wait((m) => m.a === "peers" && m.d.length === 1); // A gone
  // good token → same seat back
  const back = await join(
    "RESU",
    null,
    `&resume=${encodeURIComponent(oldId)}&token=${encodeURIComponent(a.token)}`,
  );
  assert.equal(back.id, oldId);
  const roster = await b.wait(
    (m) => m.a === "peers" && m.d.length === 2,
  );
  const row = roster.d.find((p) => p.id === oldId);
  assert.equal(row.name, "AL"); // stored hello survived
  assert.equal(row.joinedAt, oldJoinedAt); // lobby lead untouched
  // wrong token → fresh id
  back.ws.close();
  await b.wait((m) => m.a === "peers" && m.d.length === 1);
  const intruder = await join(
    "RESU",
    null,
    `&resume=${encodeURIComponent(oldId)}&token=WRONG`,
  );
  assert.notEqual(intruder.id, oldId);
  intruder.ws.close();
  await b.wait((m) => m.a === "peers" && m.d.length === 1);
  // grace expiry → fresh id even with the right token
  await sleep(900); // RESUME_MS 600 + sweep 100
  const late = await join(
    "RESU",
    null,
    `&resume=${encodeURIComponent(oldId)}&token=${encodeURIComponent(a.token)}`,
  );
  assert.notEqual(late.id, oldId);
});

test("rate limit floods get RATE_LIMITED", async () => {
  const a = await join("FLOD", "AL");
  for (let i = 0; i < 400; i++) a.send("st", { p: i });
  const msg = await a.wait((m) => m.a === "closed", 3000);
  assert.equal(msg.d, "RATE_LIMITED");
});

test("last socket close kills the room (resume stubs die with it)", async () => {
  const a = await join("EMTY", "AL");
  const oldId = a.id;
  a.ws.close();
  await a.closed;
  await sleep(200); // let the server process the drop
  const back = await join(
    "EMTY",
    null,
    `&resume=${encodeURIComponent(oldId)}&token=${encodeURIComponent(a.token)}`,
  );
  assert.notEqual(back.id, oldId); // a brand-new room, not a resume
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok — ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL — ${name}: ${err.message}`);
  } finally {
    // drop every client of this test and let the server reap them before
    // the next one (per-IP cap + room caps stay meaningful)
    for (const c of live.splice(0))
      if (c.ws.readyState === c.ws.OPEN || c.ws.readyState === c.ws.CONNECTING)
        c.ws.close();
    await sleep(150);
  }
}
server.close();
console.log(failed ? `${failed} test(s) failed` : "all relay tests passed");
process.exit(failed ? 1 : 0);
