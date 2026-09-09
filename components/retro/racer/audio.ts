/**
 * Procedural audio for the Twingo racer — pure Web Audio, zero assets.
 *
 * Everything is synthesized, in keeping with the site's hand-rolled 8-bit
 * aesthetic: a sawtooth engine whose pitch follows road speed, a bandpass
 * noise screech for the brakes, square-wave blips for the menus, pickup
 * jingles, and an infinite two-bar synthwave loop (bass pulse + minor
 * pentatonic arpeggio + noise hat) whose lead opens up with speed.
 *
 * The AudioContext can only be created/resumed inside a user gesture, so
 * start() is wired to the game's START button. A single master gain
 * carries the mute switch.
 */

export interface RacerAudio {
  /** create/resume the context and start the music — needs a user gesture */
  start(): void;
  /** fade everything out and stop the scheduler (overlay closed) */
  stop(): void;
  setMuted(muted: boolean): void;
  /** per-frame drive state: engine hum, brake screech, music intensity */
  drive(speedPercent: number, throttle: boolean, braking: boolean): void;
  pickup(big: boolean): void;
  menuMove(): void;
  menuSelect(): void;
  gameOver(): void;
}

/* note frequencies — A minor pentatonic territory */
const N = {
  A1: 55.0,
  C2: 65.41,
  D2: 73.42,
  E2: 82.41,
  G1: 49.0,
  A3: 220.0,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  G4: 392.0,
  A4: 440.0,
  C5: 523.25,
};

const BPM = 132;
const STEP = 60 / BPM / 4; // 16th note
const LOOP_STEPS = 32; // two bars of 16ths

/* bass hits on 8ths: | A . A . C . A . | G . G . A . E . | */
const BASS: (number | null)[] = [
  N.A1, null, N.A1, null, N.C2, null, N.A1, null,
  N.G1, null, N.G1, null, N.A1, null, N.E2, null,
  N.A1, null, N.A1, null, N.C2, null, N.A1, null,
  N.G1, null, N.G1, null, N.A1, null, N.D2, null,
];
/* lead arpeggio on 16ths — the Am pentatonic climb that never resolves */
const LEAD: (number | null)[] = [
  N.A3, null, N.C4, N.E4, N.A4, null, N.E4, N.C4,
  N.G4, null, N.E4, N.C4, N.D4, null, N.E4, null,
  N.A3, null, N.C4, N.E4, N.A4, null, N.C5, N.A4,
  N.G4, null, N.E4, N.D4, N.C4, null, N.D4, null,
];

export function createRacerAudio(): RacerAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;

  // engine hum: two detuned saws through a lowpass
  let engOsc1: OscillatorNode | null = null;
  let engOsc2: OscillatorNode | null = null;
  let engFilter: BiquadFilterNode | null = null;
  let engGain: GainNode | null = null;

  // brake screech: looping noise through a bandpass, gated by gain
  let brakeGain: GainNode | null = null;

  // music: per-part gains so speed can open up the lead
  let leadGain: GainNode | null = null;
  let schedTimer: ReturnType<typeof setInterval> | null = null;
  let nextTime = 0;
  let step = 0;

  const makeNoise = (c: AudioContext): AudioBufferSourceNode => {
    const len = c.sampleRate;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  };

  /** one scheduled note: osc → gain envelope → destination */
  const blip = (
    at: number,
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    dest?: AudioNode,
    slideTo?: number,
  ) => {
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(dest ?? master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  };

  const scheduleStep = (s: number, at: number) => {
    if (!ctx) return;
    const bass = BASS[s % LOOP_STEPS];
    if (bass !== null) blip(at, bass, STEP * 1.8, "square", 0.11);
    const lead = LEAD[s % LOOP_STEPS];
    if (lead !== null && leadGain) {
      // leadGain is driven per frame by road speed — route through it
      blip(at, lead, STEP * 0.9, "square", 0.5, leadGain);
    }
    // offbeat noise hat
    if (s % 4 === 2 && ctx && master) {
      const src = makeNoise(ctx);
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.03, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
      src.connect(f).connect(g).connect(master);
      src.start(at);
      src.stop(at + 0.05);
    }
  };

  const startScheduler = () => {
    if (!ctx || schedTimer) return;
    nextTime = ctx.currentTime + 0.1;
    schedTimer = setInterval(() => {
      if (!ctx) return;
      while (nextTime < ctx.currentTime + 0.6) {
        scheduleStep(step, nextTime);
        nextTime += STEP;
        step = (step + 1) % LOOP_STEPS;
      }
    }, 200);
  };

  return {
    start() {
      if (!ctx) {
        ctx = new AudioContext();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 1;
        master.connect(ctx.destination);

        // engine hum chain
        engOsc1 = ctx.createOscillator();
        engOsc1.type = "sawtooth";
        engOsc2 = ctx.createOscillator();
        engOsc2.type = "sawtooth";
        engOsc2.detune.value = 1200; // octave up
        engFilter = ctx.createBiquadFilter();
        engFilter.type = "lowpass";
        engFilter.frequency.value = 400;
        engGain = ctx.createGain();
        engGain.gain.value = 0;
        const mix = ctx.createGain();
        mix.gain.value = 1;
        const sub = ctx.createGain(); // the octave-up voice sits back
        sub.gain.value = 0.4;
        engOsc1.connect(mix);
        engOsc2.connect(sub).connect(mix);
        mix.connect(engFilter).connect(engGain).connect(master);
        engOsc1.start();
        engOsc2.start();

        // brake screech chain (gated silent)
        const noise = makeNoise(ctx);
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1800;
        bp.Q.value = 2.5;
        brakeGain = ctx.createGain();
        brakeGain.gain.value = 0;
        noise.connect(bp).connect(brakeGain).connect(master);
        noise.start();

        leadGain = ctx.createGain();
        leadGain.gain.value = 0.02;
        leadGain.connect(master);

        // lookahead scheduler: keep ~0.6 s of music queued
        step = 0;
        startScheduler();
      }
      startScheduler();
      void ctx.resume();
    },

    stop() {
      if (schedTimer) clearInterval(schedTimer);
      schedTimer = null;
      if (engGain && ctx) engGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      if (brakeGain && ctx) brakeGain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      if (ctx) void ctx.suspend();
    },

    setMuted(m) {
      muted = m;
      if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
    },

    drive(p, throttle, braking) {
      if (!ctx || !engOsc1 || !engOsc2 || !engFilter || !engGain) return;
      const t = ctx.currentTime;
      // RPM follows road speed with a little throttle kick
      const freq = 55 + p * 165 + (throttle ? 8 : 0);
      engOsc1.frequency.setTargetAtTime(freq, t, 0.05);
      engOsc2.frequency.setTargetAtTime(freq, t, 0.05);
      engFilter.frequency.setTargetAtTime(300 + p * 900, t, 0.1);
      const vol = 0.035 + p * 0.05 + (throttle ? 0.025 : 0);
      engGain.gain.setTargetAtTime(vol, t, 0.08);
      // tires only sing when the car is actually moving
      if (brakeGain) {
        brakeGain.gain.setTargetAtTime(braking && p > 0.15 ? 0.07 : 0, t, 0.04);
      }
      // the lead opens up with speed — parked is bass-only, flat out is full
      if (leadGain) leadGain.gain.setTargetAtTime(0.02 + p * 0.09, t, 0.4);
    },

    pickup(big) {
      if (!ctx) return;
      const t = ctx.currentTime;
      if (big) {
        blip(t, N.A3, 0.09, "square", 0.14);
        blip(t + 0.08, N.E4, 0.09, "square", 0.14);
        blip(t + 0.16, N.A4, 0.16, "square", 0.16);
      } else {
        blip(t, 660, 0.07, "square", 0.12);
        blip(t + 0.06, 880, 0.1, "square", 0.12);
      }
    },

    menuMove() {
      if (ctx) blip(ctx.currentTime, 440, 0.05, "square", 0.08);
    },
    menuSelect() {
      if (ctx) blip(ctx.currentTime, 660, 0.09, "square", 0.1);
    },

    gameOver() {
      if (!ctx || !engGain || !brakeGain) return;
      const t = ctx.currentTime;
      engGain.gain.setTargetAtTime(0, t, 0.1);
      brakeGain.gain.setTargetAtTime(0, t, 0.05);
      blip(t, 300, 0.8, "sawtooth", 0.12, undefined, 70);
    },
  };
}
