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
export const MAX_RACERS = 4;

export interface RaceHello {
  name: string; // 3-letter arcade initials
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
}

export interface RacePeer extends RaceHello {
  id: string;
}

export interface RaceNetHandlers {
  onPeersChanged?: (peers: RacePeer[]) => void;
  onStart?: (startAt: number) => void;
  onState?: (id: string, s: NetCarState) => void;
  /** a peer grabbed the can on this absolute segment — hide it locally
      for a few seconds, then it respawns for everyone else */
  onTake?: (id: string, segIdx: number) => void;
  /** a peer fell into the pothole on this absolute segment — consumed
      for everyone (hazards don't respawn) */
  onHole?: (id: string, segIdx: number) => void;
  onDead?: (id: string, score: number) => void;
  onRematch?: () => void;
}

export interface RaceNet {
  readonly selfId: string;
  readonly code: string;
  readonly me: RaceHello;
  setReady(ready: boolean): void;
  /** lobby leader only: everyone starts when Date.now() reaches startAt */
  startRace(startAt: number): void;
  rematch(): void;
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
    isNum(s.pos, 0, 1e9) &&
    isNum(s.x, -4, 4) &&
    isNum(s.speed, 0, 1e6) &&
    isNum(s.score, 0, 1e9) &&
    typeof s.dead === "boolean"
  );
}
const validSeg = (v: unknown): v is number => isNum(v, 0, 1e9);
const validScore = (v: unknown): v is number => isNum(v, 0, 1e9);
const validStartAt = (v: unknown): v is number => isNum(v, 0, 1e13);

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
    start: (v: number) => void;
    state: (v: NetCarState) => void;
    take: (v: number) => void;
    hole: (v: number) => void;
    dead: (v: number) => void;
    rematch: (v: 1) => void;
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
      start: (v) => void startAct.send(v),
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
      if (validStartAt(data)) this.h.onStart?.(data);
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
    rematchAct.onMessage = () => this.h.onRematch?.();

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
  startRace(startAt: number) {
    this.senders.start(startAt);
    this.h.onStart?.(startAt); // the leader's own countdown too
  }
  rematch() {
    this.senders.rematch(1);
    this.h.onRematch?.();
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
  startRace(startAt: number) {
    this.each((o) => o.h.onStart?.(startAt));
    this.h.onStart?.(startAt);
  }
  rematch() {
    this.each((o) => o.h.onRematch?.());
    this.h.onRematch?.();
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
