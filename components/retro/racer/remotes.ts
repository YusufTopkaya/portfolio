/**
 * Remote car buffer for P2P races (see net.ts): keeps the last four state
 * packets per peer and samples them ~120 ms in the past (the interpolation
 * buffer). States stream at 20 Hz (50 ms spacing), so the window always
 * holds 2-3 packets and the sample stays bracketed despite ±60 ms of
 * DataChannel arrival jitter. On loss the newest packet is dead-reckoned
 * up to 250 ms — along the track at the last known speed AND laterally at
 * the estimated dx/dt (clamped), so steering motion doesn't freeze while
 * the car drifts — then holds. A peer silent for >1.5 s is `stale` (the
 * UI fades it out, a disconnect removes it); a dead peer is parked as a
 * wreck at its final position and never extrapolates.
 *
 * Two guards keep the sampled pose honest:
 * - reorder-drop: the car never moves backwards along the track, so a
 *   packet behind the newest known pos is out-of-order and is discarded,
 *   not stored (a >50-segment backwards jump is a rematch/reset instead —
 *   that one clears the history and passes through);
 * - monotonic pos: the sampled pos never steps backwards within a run, so
 *   an extrapolation overshoot can't snap back when fresh packets land.
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
const INTERP_DELAY_MS = 120;
/** dead-reckoning past the newest packet is capped: drift, then hold */
const EXTRAP_CAP_MS = 250;
/** silence longer than this = faded out (disconnect cleanup is the net's job) */
const STALE_MS = 1500;
/** packets kept per peer — at 20 Hz the 120 ms window spans ~3 of them */
const KEEP_PACKETS = 4;
/** estimated lateral velocity cap (half-widths/s) for extrapolated x */
const MAX_LATERAL_VEL = 2.5;
/** never extrapolate x past here — the verge line is ±1.35 */
const MAX_EXTRAP_X = 1.5;
/** a backwards jump this large is a rematch/reset, not a reorder
    (50 segments × 200 world units — engine.ts SEGMENT_LENGTH) */
const RESET_JUMP = 50 * 200;
/** lerp brackets shorter than this are arrival-jitter artefacts (two
    packets landing together): clamping the span caps the lerp slope at
    ~1.7× instead of teleporting through the bracket in one frame */
const MIN_LERP_SPAN_MS = 30;
/** packets are stamped at least this far apart (80% of the 50 ms send
    spacing): a burst of jitter-compressed arrivals is spread over the
    following frames instead of collapsing into a zero-span bracket that
    would jump the car a full packet-step in one frame. Stamps may drift
    slightly into the future during a burst; a normal 50 ms gap lets the
    clock catch up, so the drift never accumulates */
const MIN_PACKET_GAP_MS = 40;

interface Packet {
  /** jitter-buffered arrival time, ms (≥ actual arrival — bursts are
      spread MIN_PACKET_GAP_MS apart at upsert time) */
  t: number;
  s: NetCarState;
}

interface Peer {
  /** oldest → newest, capped at KEEP_PACKETS */
  packets: Packet[];
  name: string;
  dead: boolean;
  deadScore: number;
  /** last sampled pos — the monotonic along-track guard's baseline */
  lastOutPos: number | null;
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

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export function createRemoteCars(): RemoteCars {
  const peers = new Map<string, Peer>();

  /* lateral velocity from the last two packets — a parked car estimates 0 */
  const lateralVel = (p: Peer): number => {
    const pk = p.packets;
    if (pk.length < 2) return 0;
    const a = pk[pk.length - 2];
    const b = pk[pk.length - 1];
    const dt = b.t - a.t;
    if (dt <= 0) return 0;
    return clamp(
      (b.s.x - a.s.x) / (dt / 1000),
      -MAX_LATERAL_VEL,
      MAX_LATERAL_VEL,
    );
  };

  const sampleOne = (id: string, p: Peer, now: number): RemoteCarView => {
    let pos: number;
    let x: number;
    let speed: number;
    let score: number;
    if (p.dead) {
      // parked wreck: hold the last known pose exactly — a spectating
      // peer's camera keeps moving, but its wreck must not
      pos = p.packets[p.packets.length - 1].s.pos;
      x = p.packets[p.packets.length - 1].s.x;
      speed = 0;
      score = p.deadScore;
    } else {
      const rt = now - INTERP_DELAY_MS;
      const pk = p.packets;
      const newest = pk[pk.length - 1];
      if (rt >= newest.t) {
        // past the window: extrapolate along the track at the last known
        // speed and laterally at the estimated velocity, capped — a lost
        // stream drifts a quarter second, then holds (the stale fade takes
        // over from there)
        const over = Math.min(EXTRAP_CAP_MS, Math.max(0, rt - newest.t));
        pos = newest.s.pos + newest.s.speed * (over / 1000);
        x = clamp(
          newest.s.x + lateralVel(p) * (over / 1000),
          -MAX_EXTRAP_X,
          MAX_EXTRAP_X,
        );
        speed = newest.s.speed;
        score = newest.s.score;
      } else {
        // bracketed: lerp the surrounding pair at the render time — hi is
        // the last packet at or before rt, and rt < newest.t guarantees
        // pk[hi + 1] exists past it
        let hi = pk.length - 1;
        while (hi > 0 && pk[hi].t > rt) hi--;
        const a = pk[hi];
        const b = pk[hi + 1];
        if (!b) {
          // a single packet and rt sits before it: hold its pose
          pos = a.s.pos;
          x = a.s.x;
          speed = a.s.speed;
          score = a.s.score;
        } else {
          const span = Math.max(MIN_LERP_SPAN_MS, b.t - a.t);
          const t = clamp((rt - a.t) / span, 0, 1);
          pos = a.s.pos + (b.s.pos - a.s.pos) * t;
          x = a.s.x + (b.s.x - a.s.x) * t;
          speed = a.s.speed + (b.s.speed - a.s.speed) * t;
          score = a.s.score + (b.s.score - a.s.score) * t;
        }
      }
      // monotonic along-track guard: a lerp against a stale packet or an
      // extrapolation overshoot must never move the car backwards — unless
      // the peer clearly reset (rematch/respawn jumps the pos back to ~0,
      // far past RESET_JUMP), which passes through
      if (
        p.lastOutPos !== null &&
        pos < p.lastOutPos &&
        p.lastOutPos - pos <= RESET_JUMP
      ) {
        pos = p.lastOutPos;
      }
    }
    p.lastOutPos = pos;
    return {
      id,
      pos,
      x,
      speed,
      score,
      name: p.name,
      dead: p.dead,
      stale: !p.dead && now - p.packets[p.packets.length - 1].t > STALE_MS,
    };
  };

  return {
    upsert(id, s, now) {
      const p = peers.get(id);
      if (p) {
        if (p.dead) return; // the wreck is parked — late packets can't move it
        const newest = p.packets[p.packets.length - 1];
        const back = newest.s.pos - s.pos;
        if (back > RESET_JUMP) {
          // rematch/reset: the car jumped back to the start — drop the old
          // run's packets so no lerp ever spans across the two runs
          p.packets = [{ t: now, s }];
          p.lastOutPos = null;
        } else if (back > 0) {
          // out-of-order (DataChannel reordering): the car never moves
          // backwards along the track, so a stale packet is dropped, not
          // stored — a dead flag on it is still honoured below
          if (s.dead) {
            p.dead = true;
            p.deadScore = s.score;
          }
          return;
        } else {
          // stamp jitter-compressed arrivals apart (see MIN_PACKET_GAP_MS)
          const t = Math.max(now, newest.t + MIN_PACKET_GAP_MS);
          p.packets.push({ t, s });
          if (p.packets.length > KEEP_PACKETS) p.packets.shift();
        }
        if (s.dead) {
          p.dead = true;
          p.deadScore = s.score;
        }
      } else {
        peers.set(id, {
          packets: [{ t: now, s }],
          name: "",
          dead: s.dead,
          deadScore: s.dead ? s.score : 0,
          lastOutPos: null,
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
