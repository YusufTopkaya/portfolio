/**
 * Backend-less P2P race networking for the Twingo racer (Trystero over
 * public Nostr relays — signaling only; race traffic flows browser to
 * browser over WebRTC DataChannels).
 *
 * The track is identical for everyone (the daily seed), so the wire only
 * carries car state, pickup/hole consumption and lobby messages. There is
 * no host: the peer with the oldest `joinedAt` is the deterministic lobby
 * leader (starts races, owns the track seed) and the next-oldest takes
 * over if it drops.
 *
 * `LoopbackNet` implements the same interface in-page (a static hub per
 * room code) so e2e tests can run a full two-player race in ONE browser
 * context with zero network.
 */

import { joinRoom, selfId } from "trystero";

export const NET_APP_ID = "yusuf-twingo-racer";
export const MAX_RACERS = 5;
/** countdown from receiving the start message to GO — receipt-relative
    (clock-skew-proof), everyone counts their own */
export const START_COUNTDOWN_MS = 3500;

export interface RaceHello {
  name: string; // display name, up to 10 chars (A-Z 0-9 space)
  seed: number; // the player's turkeyDay() at join time
  joinedAt: number; // Date.now() — oldest peer is the lobby leader
  ready: boolean;
}

export interface NetCarState {
  pos: number; // world position (units along the track)
  x: number; // lateral, road half-widths
  speed: number;
  score: number;
  dead: boolean;
  /** current steering, -1 (full left) .. 1 (full right) — the remote
      renderer picks the matching sprite frame so friends see you turn */
  steer?: number;
}

/** race-start message from the lobby leader. `ms` is a countdown FROM
    RECEIPT (never an absolute timestamp — device clocks can be minutes
    apart, one-way relay latency is tens of ms); `seed` is the per-race
    track seed: every race in the room gets its own random layout, the
    daily track is never used for VS races */
export interface RaceStart {
  ms: number;
  seed: number;
}

export interface RacePeer extends RaceHello {
  id: string;
}

export interface RaceNetHandlers {
  onPeersChanged?: (peers: RacePeer[]) => void;
  onStart?: (s: RaceStart) => void;
  onState?: (id: string, s: NetCarState) => void;
  /** a peer grabbed the can on this absolute segment — hide it locally
      for a few seconds, then it respawns for everyone else */
  onTake?: (id: string, segIdx: number) => void;
  /** a peer fell into the pothole on this absolute segment — consumed
      for everyone (hazards don't respawn) */
  onHole?: (id: string, segIdx: number) => void;
  onDead?: (id: string, score: number) => void;
  /** leader triggered a rematch — carries the fresh per-race track seed */
  onRematch?: (seed: number) => void;
}

export interface RaceNet {
  readonly selfId: string;
  readonly code: string;
  readonly me: RaceHello;
  setReady(ready: boolean): void;
  /** lobby display name change: updates `me` and re-announces the hello
      (peers keep the ORIGINAL joinedAt/seed, so a rename never moves the
      lobby lead or the track seed) */
  setName(name: string): void;
  /** lobby leader only: everyone starts `START_COUNTDOWN_MS` after they
      receive this, on a fresh random track seed (per-race layout) */
  startRace(seed: number): void;
  /** lobby leader only: rematch with a fresh per-race track seed */
  rematch(seed: number): void;
  sendState(s: NetCarState): void;
  sendTake(segIdx: number): void;
  sendHole(segIdx: number): void;
  sendDead(score: number): void;
  leave(): void;
}

/* ── message validation — anything malformed is dropped silently ── */

const isStr = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 12;
const isNum = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

function validHello(v: unknown): v is RaceHello {
  const h = v as RaceHello;
  return (
    !!h &&
    isStr(h.name) &&
    isNum(h.seed, 0, 1e9) &&
    isNum(h.joinedAt, 0, 1e13) &&
    typeof h.ready === "boolean"
  );
}
function validState(v: unknown): v is NetCarState {
  const s = v as NetCarState;
  return (
    !!s &&
    isNum(s.pos, -24000, 1e9) && // negative is legal: back-row grid slot
    isNum(s.x, -4, 4) &&
    isNum(s.speed, 0, 1e6) &&
    isNum(s.score, 0, 1e9) &&
    typeof s.dead === "boolean" &&
    (s.steer === undefined || isNum(s.steer, -1, 1))
  );
}
const validSeg = (v: unknown): v is number => isNum(v, 0, 1e9);
const validScore = (v: unknown): v is number => isNum(v, 0, 1e9);
const validSeed = (v: unknown): v is number => isNum(v, 0, 1e9);
function validStart(v: unknown): v is RaceStart {
  const s = v as RaceStart;
  return !!s && isNum(s.ms, 500, 10000) && isNum(s.seed, 0, 1e9);
}

/* ── Trystero (real network) ── */

export class TrysteroNet implements RaceNet {
  readonly selfId = selfId;
  readonly code: string;
  readonly me: RaceHello;
  private room: ReturnType<typeof joinRoom>;
  private peers = new Map<string, RaceHello>();
  private h: RaceNetHandlers;
  private senders: {
    hello: (v: RaceHello, to?: string) => void;
    start: (v: RaceStart) => void;
    state: (v: NetCarState) => void;
    take: (v: number) => void;
    hole: (v: number) => void;
    dead: (v: number) => void;
    rematch: (v: number) => void;
  };

  constructor(code: string, hello: RaceHello, handlers: RaceNetHandlers) {
    this.code = code;
    this.me = hello;
    this.h = handlers;
    this.room = joinRoom(
      { appId: NET_APP_ID },
      `twingo-race-v1:${code.toUpperCase()}`,
    );
    // trystero 0.25: makeAction returns {send, onMessage} (no tuple), and
    // its DataPayload constraint wants an index signature — payloads are
    // validated on receipt anyway, so keep the actions loosely typed and
    // cast at the boundary
    const helloAct = this.room.makeAction("hello");
    const startAct = this.room.makeAction("start");
    const stateAct = this.room.makeAction("st");
    const takeAct = this.room.makeAction("take");
    const holeAct = this.room.makeAction("hole");
    const deadAct = this.room.makeAction("dead");
    const rematchAct = this.room.makeAction("rematch");
    // trystero 0.25: makeAction returns {send, onMessage} (no tuple), and
    // its DataPayload constraint wants a JsonValue-mapped object — payloads
    // are validated on receipt anyway, so cast at the boundary
    type Wire = { [key: string]: string | number | boolean };
    this.senders = {
      hello: (v, to) =>
        void helloAct.send(v as unknown as Wire, { target: to ?? null }),
      start: (v) => void startAct.send(v as unknown as Wire),
      state: (v) => void stateAct.send(v as unknown as Wire),
      take: (v) => void takeAct.send(v),
      hole: (v) => void holeAct.send(v),
      dead: (v) => void deadAct.send(v),
      rematch: (v) => void rematchAct.send(v),
    };

    helloAct.onMessage = (data, ctx) => {
      if (!validHello(data)) return;
      const existing = this.peers.get(ctx.peerId);
      // keep the ORIGINAL joinedAt/seed — a peer re-announcing with a
      // fresher clock must not steal the lobby lead or move the track
      const keep = existing && existing.joinedAt <= data.joinedAt;
      this.peers.set(ctx.peerId, {
        name: data.name,
        seed: keep ? existing.seed : data.seed,
        joinedAt: keep ? existing.joinedAt : data.joinedAt,
        ready: data.ready,
      });
      this.emitPeers();
    };
    startAct.onMessage = (data) => {
      if (validStart(data)) this.h.onStart?.(data);
    };
    stateAct.onMessage = (data, ctx) => {
      if (validState(data)) this.h.onState?.(ctx.peerId, data);
    };
    takeAct.onMessage = (data, ctx) => {
      if (validSeg(data)) this.h.onTake?.(ctx.peerId, data);
    };
    holeAct.onMessage = (data, ctx) => {
      if (validSeg(data)) this.h.onHole?.(ctx.peerId, data);
    };
    deadAct.onMessage = (data, ctx) => {
      if (validScore(data)) this.h.onDead?.(ctx.peerId, data);
    };
    rematchAct.onMessage = (data) => {
      if (validSeed(data)) this.h.onRematch?.(data);
    };

    this.room.onPeerJoin = (id) => {
      // answer the newcomer with our hello (they broadcast theirs on join)
      this.senders.hello(this.me, id);
    };
    this.room.onPeerLeave = (id) => {
      this.peers.delete(id);
      this.emitPeers();
    };
    // announce ourselves to anyone already in the room
    this.senders.hello(this.me);
  }

  private emitPeers() {
    const peers: RacePeer[] = [
      { id: this.selfId, ...this.me },
      ...[...this.peers.entries()].map(([id, p]) => ({ id, ...p })),
    ];
    peers.sort((a, b) => a.joinedAt - b.joinedAt);
    this.h.onPeersChanged?.(peers);
  }

  setReady(ready: boolean) {
    this.me.ready = ready;
    this.senders.hello(this.me);
    this.emitPeers();
  }
  setName(name: string) {
    this.me.name = name;
    this.senders.hello(this.me);
    this.emitPeers();
  }
  startRace(seed: number) {
    const msg: RaceStart = { ms: START_COUNTDOWN_MS, seed };
    this.senders.start(msg);
    this.h.onStart?.(msg); // the leader's own countdown too
  }
  rematch(seed: number) {
    this.senders.rematch(seed);
    this.h.onRematch?.(seed);
  }
  sendState(s: NetCarState) {
    this.senders.state(s);
  }
  sendTake(segIdx: number) {
    this.senders.take(segIdx);
  }
  sendHole(segIdx: number) {
    this.senders.hole(segIdx);
  }
  sendDead(score: number) {
    this.senders.dead(score);
  }
  leave() {
    void this.room.leave();
    this.peers.clear();
  }
}

/* ── Loopback (in-page, for tests) ── */

export class LoopbackNet implements RaceNet {
  private static hubs = new Map<string, Set<LoopbackNet>>();
  readonly selfId: string;
  readonly code: string;
  readonly me: RaceHello;
  private h: RaceNetHandlers;
  private peers = new Map<string, RaceHello>();

  constructor(code: string, hello: RaceHello, handlers: RaceNetHandlers) {
    this.code = code.toUpperCase();
    this.me = hello;
    this.h = handlers;
    this.selfId = `loop-${Math.random().toString(36).slice(2, 10)}`;
    const hub = LoopbackNet.hubs.get(this.code) ?? new Set();
    LoopbackNet.hubs.set(this.code, hub);
    // learn about everyone already here, then announce ourselves
    for (const other of hub) {
      this.peers.set(other.selfId, { ...other.me });
      other.peers.set(this.selfId, { ...this.me });
      other.emitPeers();
    }
    hub.add(this);
    this.emitPeers();
  }

  private each(fn: (other: LoopbackNet) => void) {
    const hub = LoopbackNet.hubs.get(this.code);
    if (!hub) return;
    for (const other of hub) if (other !== this) fn(other);
  }
  private emitPeers() {
    const peers: RacePeer[] = [
      { id: this.selfId, ...this.me },
      ...[...this.peers.entries()].map(([id, p]) => ({ id, ...p })),
    ];
    peers.sort((a, b) => a.joinedAt - b.joinedAt);
    this.h.onPeersChanged?.(peers);
  }

  setReady(ready: boolean) {
    this.me.ready = ready;
    this.each((o) => {
      o.peers.set(this.selfId, { ...this.me });
      o.emitPeers();
    });
    this.emitPeers();
  }
  setName(name: string) {
    this.me.name = name;
    this.each((o) => {
      o.peers.set(this.selfId, { ...this.me });
      o.emitPeers();
    });
    this.emitPeers();
  }
  startRace(seed: number) {
    const msg: RaceStart = { ms: START_COUNTDOWN_MS, seed };
    this.each((o) => o.h.onStart?.(msg));
    this.h.onStart?.(msg);
  }
  rematch(seed: number) {
    this.each((o) => o.h.onRematch?.(seed));
    this.h.onRematch?.(seed);
  }
  sendState(s: NetCarState) {
    this.each((o) => o.h.onState?.(this.selfId, s));
  }
  sendTake(segIdx: number) {
    this.each((o) => o.h.onTake?.(this.selfId, segIdx));
  }
  sendHole(segIdx: number) {
    this.each((o) => o.h.onHole?.(this.selfId, segIdx));
  }
  sendDead(score: number) {
    this.each((o) => o.h.onDead?.(this.selfId, score));
  }
  leave() {
    const hub = LoopbackNet.hubs.get(this.code);
    hub?.delete(this);
    this.each((o) => {
      o.peers.delete(this.selfId);
      o.emitPeers();
    });
  }
}
