/**
 * Remote car buffer for P2P races (see net.ts): keeps the last eight state
 * packets per peer and samples them ~100 ms in the past (the interpolation
 * window). States stream at ~60 Hz (one per sender frame). Brackets are
 * measured on the SENDER's clock (NetCarState.t): arrival jitter then only
 * shifts WHEN packets land, never the lerp spans — interpolating between
 * arrival stamps made the sampled speed oscillate with the jitter (the
 * spectate-camera judder bug). The receiver↔sender clock offset is tracked
 * as a smoothed per-peer value, so clock skew and drift are absorbed.
 * Peers predating the `t` field fall back to arrival stamping (the old
 * behaviour). On loss the newest packet is dead-reckoned up to 100 ms —
 * along the track at the last known speed AND laterally at the estimated
 * dx/dt (clamped), so steering motion doesn't freeze while the car drifts —
 * then holds. A peer silent for >1.5 s is `stale` (the UI fades it out, a
 * disconnect removes it); a dead peer is parked as a wreck at its final
 * position and never extrapolates.
 *
 * Two guards keep the sampled pose honest:
 * - reorder-drop: the car never moves backwards along the track, so a
 *   packet behind the newest known pos is out-of-order and is discarded,
 *   not stored (a >50-segment backwards jump is a rematch/reset instead —
 *   that one clears the history and passes through);
 * - monotonic pos: the sampled pos never steps backwards within a run, so
 *   an extrapolation overshoot can't snap back when fresh packets land.
 *
 * All times are milliseconds — arrival times on the caller's clock
 * (performance.now()), sender stamps on the peer's clock, bridged by the
 * per-peer offset. The store never reads a clock itself, so tests can
 * drive it manually.
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
  /** lobby display name ("" until setName lands) */
  name: string;
  dead: boolean;
  /** no packet for >1.5 s — render faded, on the way to removal */
  stale: boolean;
  /** current steering, -1 (full left) .. 1 (full right) — lerped between
      the bracketing packets like x, held while extrapolating, 0 when the
      sender predates the field. The renderer picks the lean frame from it */
  steer: number;
  /** estimated lateral velocity (half-widths/s) from the last two packets,
      clamped — the engine's car-car collision exchanges it like momentum */
  latVel: number;
  /** the peer is slowing faster than coasting drag — light its stop lamps */
  braking: boolean;
  /** fuel-chain streak (jerrycan counter) — discrete, newest packet's
      value; the spectate HUD mirrors it. 0 from pre-streak peers */
  streak: number;
  /** fuel dots / crashes used, newest packet's values — the spectate HUD
      restamps the engine's own cluster + hearts with them. undefined
      from peers predating the fields (the HUD then keeps ours) */
  fuel?: number;
  crashes?: number;
}

/** render the field this far in the past so two packets bracket the sample
    — at the 60 Hz frame-cadence stream (~16.7 ms packets) 100 ms spans ~6 */
const INTERP_DELAY_MS = 100;
/** dead-reckoning past the newest packet is capped: drift, then hold. Kept
    at ~6 send intervals — with dense 60 Hz packets a stall this long is
    already a network gap, extrapolate briefly then hold the pose */
const EXTRAP_CAP_MS = 100;
/** silence longer than this = faded out (disconnect cleanup is the net's job) */
const STALE_MS = 1500;
/** packets kept per peer — 8 covers the 100 ms window with headroom */
const KEEP_PACKETS = 8;
/** estimated lateral velocity cap (half-widths/s) for extrapolated x */
const MAX_LATERAL_VEL = 2.5;
/** never extrapolate x past here — the verge line is ±1.35 */
const MAX_EXTRAP_X = 1.5;
/** a backwards jump this large is a rematch/reset, not a reorder
    (50 segments × 200 world units — engine.ts SEGMENT_LENGTH) */
const RESET_JUMP = 50 * 200;
/** lerp brackets shorter than this are arrival-jitter artefacts (two
    packets landing together): clamping the span caps the lerp slope at
    ~2× instead of teleporting through the bracket in one frame. At the
    60 Hz stream the packet spacing is ~16.7 ms, so this still leaves
    normal pairs unclamped */
const MIN_LERP_SPAN_MS = 8;
/** packets are stamped at least this far apart (~60% of the ~16.7 ms send
    spacing): a burst of jitter-compressed arrivals is spread over the
    following frames instead of collapsing into a zero-span bracket that
    would jump the car a full packet-step in one frame. Stamped peers
    (NetCarState.t) interpolate on the sender's clock instead — this stamp
    now only drives staleness and the pre-`t` fallback brackets */
const MIN_PACKET_GAP_MS = 10;
/** mirrors engine.ts ROLL_DRAG (the proportional coasting decel, 1/s) —
    kept local to avoid an import cycle (engine imports this store). A
    peer slowing faster than 1.5× this drag is braking (or off-road),
    never just coasting or climbing: gravity tops out at ~0.027·MAX_SPEED/s
    while the drag floor this clears is 0.09·MAX_SPEED/s even at 54 km/h,
    and a mid-shift coast is gentler than the drag, not harder */
const COAST_DRAG = 0.3;

interface Packet {
  /** jitter-buffered arrival time, ms on OUR clock (≥ actual arrival —
      bursts are spread MIN_PACKET_GAP_MS apart at upsert time). Used for
      staleness and as the interpolation stamp for pre-`t` peers */
  t: number;
  /** send time on the PEER's clock (NetCarState.t), or `t` when the peer
      predates the field — the lerp brackets are measured between these,
      so arrival jitter never compresses a span */
  st: number;
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
  /** ourClock − senderClock, smoothed per packet (arrival jitter averages
      out across the ~6 packets in the window); null until a stamped
      packet lands — pre-`t` peers interpolate on arrival stamps */
  clockOffset: number | null;
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

  /* stop-lamp detection: speed dropping between the last two packets by
     more than 1.5× the coasting drag — a margin that keeps hills, gear
     shifts and packet jitter from ever lighting the lamps */
  const brakingNow = (p: Peer): boolean => {
    const pk = p.packets;
    if (pk.length < 2) return false;
    const a = pk[pk.length - 2];
    const b = pk[pk.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) return false;
    const decel = (a.s.speed - b.s.speed) / dt;
    return decel > b.s.speed * COAST_DRAG * 1.5;
  };

  const sampleOne = (id: string, p: Peer, now: number): RemoteCarView => {
    let pos: number;
    let x: number;
    let speed: number;
    let score: number;
    let steer: number;
    if (p.dead) {
      // parked wreck: hold the last known pose exactly — a spectating
      // peer's camera keeps moving, but its wreck must not
      const last = p.packets[p.packets.length - 1].s;
      pos = last.pos;
      x = last.x;
      speed = 0;
      score = p.deadScore;
      steer = last.steer ?? 0;
    } else {
      // render time on the SENDER's clock: the smoothed offset bridges
      // the two clocks, so the lerp fractions below ride the peer's true
      // ~16.7 ms send spacing, not our jittered arrival times
      const rt = now - (p.clockOffset ?? 0) - INTERP_DELAY_MS;
      const pk = p.packets;
      const newest = pk[pk.length - 1];
      if (rt >= newest.st) {
        // past the window: extrapolate along the track at the last known
        // speed and laterally at the estimated velocity, capped — a lost
        // stream drifts briefly, then holds (the stale fade takes over
        // from there). Steering holds the last reported value — the wheel
        // isn't dead-reckoned
        const over = Math.min(EXTRAP_CAP_MS, Math.max(0, rt - newest.st));
        pos = newest.s.pos + newest.s.speed * (over / 1000);
        x = clamp(
          newest.s.x + lateralVel(p) * (over / 1000),
          -MAX_EXTRAP_X,
          MAX_EXTRAP_X,
        );
        speed = newest.s.speed;
        score = newest.s.score;
        steer = newest.s.steer ?? 0;
      } else {
        // bracketed: lerp the surrounding pair at the render time — hi is
        // the last packet stamped at or before rt, and rt < newest.st
        // guarantees pk[hi + 1] exists past it
        let hi = pk.length - 1;
        while (hi > 0 && pk[hi].st > rt) hi--;
        const a = pk[hi];
        const b = pk[hi + 1];
        if (!b) {
          // a single packet and rt sits before it: hold its pose
          pos = a.s.pos;
          x = a.s.x;
          speed = a.s.speed;
          score = a.s.score;
          steer = a.s.steer ?? 0;
        } else {
          const span = Math.max(MIN_LERP_SPAN_MS, b.st - a.st);
          const t = clamp((rt - a.st) / span, 0, 1);
          pos = a.s.pos + (b.s.pos - a.s.pos) * t;
          x = a.s.x + (b.s.x - a.s.x) * t;
          speed = a.s.speed + (b.s.speed - a.s.speed) * t;
          score = a.s.score + (b.s.score - a.s.score) * t;
          steer = (a.s.steer ?? 0) + ((b.s.steer ?? 0) - (a.s.steer ?? 0)) * t;
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
    // discrete HUD fields ride the newest packet, not the lerp — a fuel
    // dot or streak count is an event, not a continuum
    const latest = p.packets[p.packets.length - 1].s;
    return {
      id,
      pos,
      x,
      speed,
      score,
      name: p.name,
      dead: p.dead,
      stale: !p.dead && now - p.packets[p.packets.length - 1].t > STALE_MS,
      steer,
      latVel: p.dead ? 0 : lateralVel(p),
      braking: !p.dead && brakingNow(p),
      streak: latest.streak ?? 0,
      fuel: latest.fuel,
      crashes: latest.crashes,
    };
  };

  return {
    upsert(id, s, now) {
      // bridge the two clocks off this packet's RAW arrival (the spread
      // stamp would inject our own jitter-buffering into the estimate);
      // alpha 0.15 converges in ~15 packets (~¼ s) and then just tracks
      // clock drift
      const trackClock = (p: Peer) => {
        if (s.t === undefined) return;
        const off = now - s.t;
        p.clockOffset =
          p.clockOffset === null
            ? off
            : p.clockOffset + (off - p.clockOffset) * 0.15;
      };
      const p = peers.get(id);
      if (p) {
        if (p.dead) return; // the wreck is parked — late packets can't move it
        const newest = p.packets[p.packets.length - 1];
        const back = newest.s.pos - s.pos;
        if (back > RESET_JUMP) {
          // rematch/reset: the car jumped back to the start — drop the old
          // run's packets so no lerp ever spans across the two runs
          trackClock(p);
          p.packets = [{ t: now, st: s.t ?? now, s }];
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
          trackClock(p);
          p.packets.push({ t, st: s.t ?? t, s });
          if (p.packets.length > KEEP_PACKETS) p.packets.shift();
        }
        if (s.dead) {
          p.dead = true;
          p.deadScore = s.score;
        }
      } else {
        peers.set(id, {
          packets: [{ t: now, st: s.t ?? now, s }],
          name: "",
          dead: s.dead,
          deadScore: s.dead ? s.score : 0,
          lastOutPos: null,
          clockOffset: s.t === undefined ? null : now - s.t,
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
