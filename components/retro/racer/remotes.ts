/**
 * Remote car buffer for P2P races (see net.ts): keeps the last two state
 * packets per peer and samples them ~100 ms in the past (the interpolation
 * buffer), dead-reckoning up to 250 ms past the newest packet on loss so a
 * lagging peer drifts smoothly instead of freezing. A peer silent for
 * >1.5 s is `stale` (the UI fades it out, a disconnect removes it); a dead
 * peer is parked as a wreck at its final position and never extrapolates.
 *
 * All times are milliseconds on the caller's clock (performance.now()) —
 * the store never reads a clock itself, so tests can drive it manually.
 */

import type { NetCarState } from "./net";

export interface RemoteCarView {
  id: string;
  /** world position along the track (same units as EngineState.position) */
  pos: number;
  /** lateral position, road half-widths (±1 = edge) */
  x: number;
  speed: number;
  score: number;
  /** 3-letter arcade initials ("" until setName lands) */
  name: string;
  dead: boolean;
  /** no packet for >1.5 s — render faded, on the way to removal */
  stale: boolean;
}

/** render the field this far in the past so two packets bracket the sample */
const INTERP_DELAY_MS = 100;
/** dead-reckoning past the newest packet is capped: drift, then hold */
const EXTRAP_CAP_MS = 250;
/** silence longer than this = faded out (disconnect cleanup is the net's job) */
const STALE_MS = 1500;

interface Packet {
  t: number; // arrival time, ms
  s: NetCarState;
}

interface Peer {
  prev: Packet | null;
  cur: Packet;
  name: string;
  dead: boolean;
  deadScore: number;
}

export interface RemoteCars {
  /** record a freshly arrived state packet for this peer */
  upsert(id: string, s: NetCarState, now: number): void;
  /** interpolated views of every known peer, at the given time */
  sample(now: number): RemoteCarView[];
  /** final death notice (the `dead` message): park the wreck, fix the score */
  markDead(id: string, score: number): void;
  setName(id: string, name: string): void;
  remove(id: string): void;
  clear(): void;
  readonly size: number;
}

export function createRemoteCars(): RemoteCars {
  const peers = new Map<string, Peer>();

  const sampleOne = (id: string, p: Peer, now: number): RemoteCarView => {
    let pos: number;
    let x: number;
    let speed: number;
    let score: number;
    if (p.dead) {
      // parked wreck: hold the last known pose exactly — a spectating
      // peer's camera keeps moving, but its wreck must not
      pos = p.cur.s.pos;
      x = p.cur.s.x;
      speed = 0;
      score = p.deadScore;
    } else {
      const rt = now - INTERP_DELAY_MS;
      if (p.prev && rt <= p.cur.t) {
        // bracketed: lerp the two packets at the render time
        const span = Math.max(1, p.cur.t - p.prev.t);
        const t = Math.max(0, Math.min(1, (rt - p.prev.t) / span));
        pos = p.prev.s.pos + (p.cur.s.pos - p.prev.s.pos) * t;
        x = p.prev.s.x + (p.cur.s.x - p.prev.s.x) * t;
        speed = p.prev.s.speed + (p.cur.s.speed - p.prev.s.speed) * t;
        score = p.prev.s.score + (p.cur.s.score - p.prev.s.score) * t;
      } else {
        // past (or before) the window: extrapolate along the track at the
        // last known speed, capped — a lost stream drifts a quarter second,
        // then holds (the stale fade takes over from there)
        const over = Math.min(EXTRAP_CAP_MS, Math.max(0, rt - p.cur.t));
        pos = p.cur.s.pos + p.cur.s.speed * (over / 1000);
        x = p.cur.s.x;
        speed = p.cur.s.speed;
        score = p.cur.s.score;
      }
    }
    return {
      id,
      pos,
      x,
      speed,
      score,
      name: p.name,
      dead: p.dead,
      stale: !p.dead && now - p.cur.t > STALE_MS,
    };
  };

  return {
    upsert(id, s, now) {
      const p = peers.get(id);
      if (p) {
        if (p.dead) return; // the wreck is parked — late packets can't move it
        p.prev = p.cur;
        p.cur = { t: now, s };
        if (s.dead) {
          p.dead = true;
          p.deadScore = s.score;
        }
      } else {
        peers.set(id, {
          prev: null,
          cur: { t: now, s },
          name: "",
          dead: s.dead,
          deadScore: s.dead ? s.score : 0,
        });
      }
    },
    sample(now) {
      const out: RemoteCarView[] = [];
      for (const [id, p] of peers) out.push(sampleOne(id, p, now));
      return out;
    },
    markDead(id, score) {
      const p = peers.get(id);
      if (!p) return;
      p.dead = true;
      p.deadScore = score;
    },
    setName(id, name) {
      const p = peers.get(id);
      if (p) p.name = name;
    },
    remove(id) {
      peers.delete(id);
    },
    clear() {
      peers.clear();
    },
    get size() {
      return peers.size;
    },
  };
}
