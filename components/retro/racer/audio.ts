/**
 * Procedural audio for the Twingo racer — pure Web Audio, zero assets.
 *
 * Everything is synthesized, in keeping with the site's hand-rolled 8-bit
 * aesthetic: a sawtooth engine whose pitch follows the 5-speed gearbox
 * (RPM climbs through each gear, the throttle cuts for a beat on every
 * shift), bandpass noise screeches for the brakes and for tires sliding
 * past their grip limit, square-wave blips for the menus, pickup jingles,
 * and an infinite synthwave loop that gets progressively denser as the
 * score climbs (bass+hat → lead → octave doubler → double-time hats).
 *
 * The AudioContext can only be created/resumed inside a user gesture, so
 * start() is wired to the game's START button. A master gain carries the
 * mute switch; three buses under it (music / engine / menu) carry the
 * per-channel 0-10 volume settings.
 */

export interface RacerVolumes {
  music: number; // 0-10
  engine: number; // 0-10
  menu: number; // 0-10
}

export interface RacerAudio {
  /** create/resume the context and start the music — needs a user gesture */
  start(): void;
  /** fade everything out and stop the scheduler (overlay closed) */
  stop(): void;
  setMuted(muted: boolean): void;
  setVolumes(v: RacerVolumes): void;
  getVolumes(): RacerVolumes;
  /**
   * per-frame drive state: engine hum (rpm01 = revs inside the current
   * gear, shifting = throttle cut), brake/tire screech, music intensity
   */
  drive(
    speedPercent: number,
    throttle: boolean,
    braking: boolean,
    skid: number,
    rpm01: number,
    shifting: boolean,
    score: number,
  ): void;
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

/* score thresholds where the loop picks up another layer */
const TIER_LEAD = 25_000; // lead arpeggio opens up
const TIER_OCTAVE = 60_000; // lead doubled an octave up
const TIER_HATS = 100_000; // hats go double-time

/** 0-10 slider → gain, with a perceptual curve so 5 feels like "half" */
const levelToGain = (level: number): number =>
  Math.pow(Math.max(0, Math.min(10, level)) / 10, 1.5);

export function createRacerAudio(): RacerAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let musicBus: GainNode | null = null;
  let engineBus: GainNode | null = null;
  let menuBus: GainNode | null = null;
  let muted = false;
  let volumes: RacerVolumes = { music: 8, engine: 8, menu: 8 };

  // engine hum: two detuned saws through a lowpass
  let engOsc1: OscillatorNode | null = null;
  let engOsc2: OscillatorNode | null = null;
  let engFilter: BiquadFilterNode | null = null;
  let engGain: GainNode | null = null;

  // brake screech / tire skid: looping noise through bandpasses, gain-gated
  let brakeGain: GainNode | null = null;
  let skidGain: GainNode | null = null;

  // music: per-part gains so speed/score can open up layers
  let leadGain: GainNode | null = null;
  let lead2Gain: GainNode | null = null; // octave-up doubler
  let schedTimer: ReturnType<typeof setInterval> | null = null;
  let nextTime = 0;
  let step = 0;
  let musicTier = 0; // 0..3, driven by score

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
    if (!ctx || !musicBus) return;
    const bass = BASS[s % LOOP_STEPS];
    if (bass !== null) blip(at, bass, STEP * 1.8, "square", 0.11, musicBus);
    const lead = LEAD[s % LOOP_STEPS];
    if (lead !== null) {
      // leadGain/lead2Gain are driven per frame by speed and score tier
      if (leadGain) blip(at, lead, STEP * 0.9, "square", 0.5, leadGain);
      if (lead2Gain)
        blip(at, lead * 2, STEP * 0.7, "square", 0.3, lead2Gain);
    }
    // offbeat noise hat — double-time from tier 3 on
    const hat = s % 4 === 2 || (musicTier >= 3 && s % 8 === 6);
    if (hat) {
      const src = makeNoise(ctx);
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.03, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
      src.connect(f).connect(g).connect(musicBus);
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

        musicBus = ctx.createGain();
        musicBus.gain.value = levelToGain(volumes.music);
        musicBus.connect(master);
        engineBus = ctx.createGain();
        engineBus.gain.value = levelToGain(volumes.engine);
        engineBus.connect(master);
        menuBus = ctx.createGain();
        menuBus.gain.value = levelToGain(volumes.menu);
        menuBus.connect(master);

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
        mix.connect(engFilter).connect(engGain).connect(engineBus);
        engOsc1.start();
        engOsc2.start();

        // brake screech chain (gated silent)
        const brakeNoise = makeNoise(ctx);
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1800;
        bp.Q.value = 2.5;
        brakeGain = ctx.createGain();
        brakeGain.gain.value = 0;
        brakeNoise.connect(bp).connect(brakeGain).connect(engineBus);
        brakeNoise.start();

        // tire skid chain — lower, hollower band than the brake screech
        const skidNoise = makeNoise(ctx);
        const sbp = ctx.createBiquadFilter();
        sbp.type = "bandpass";
        sbp.frequency.value = 950;
        sbp.Q.value = 1.2;
        skidGain = ctx.createGain();
        skidGain.gain.value = 0;
        skidNoise.connect(sbp).connect(skidGain).connect(engineBus);
        skidNoise.start();

        leadGain = ctx.createGain();
        leadGain.gain.value = 0.02;
        leadGain.connect(musicBus);
        lead2Gain = ctx.createGain();
        lead2Gain.gain.value = 0;
        lead2Gain.connect(musicBus);

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
      if (brakeGain && ctx)
        brakeGain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      if (skidGain && ctx) skidGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      if (ctx) void ctx.suspend();
    },

    setMuted(m) {
      muted = m;
      if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
    },

    setVolumes(v) {
      volumes = { ...v };
      if (!ctx) return;
      const t = ctx.currentTime;
      if (musicBus) musicBus.gain.setTargetAtTime(levelToGain(v.music), t, 0.02);
      if (engineBus)
        engineBus.gain.setTargetAtTime(levelToGain(v.engine), t, 0.02);
      if (menuBus) menuBus.gain.setTargetAtTime(levelToGain(v.menu), t, 0.02);
    },

    getVolumes() {
      return { ...volumes };
    },

    drive(p, throttle, braking, skid, rpm01, shifting, score) {
      if (!ctx || !engOsc1 || !engOsc2 || !engFilter || !engGain) return;
      const t = ctx.currentTime;
      // RPM sweeps the same range inside every gear, so the pitch climbs,
      // drops on the shift, climbs again — a real gearbox, not a CVT whine
      let freq = 60 + rpm01 * 160 + (throttle ? 8 : 0);
      let vol = 0.035 + p * 0.05 + (throttle ? 0.025 : 0);
      if (shifting) {
        // throttle lift between gears: revs fall, the engine goes quiet
        freq *= 0.75;
        vol *= 0.3;
      }
      engOsc1.frequency.setTargetAtTime(freq, t, 0.05);
      engOsc2.frequency.setTargetAtTime(freq, t, 0.05);
      engFilter.frequency.setTargetAtTime(300 + rpm01 * 900, t, 0.1);
      engGain.gain.setTargetAtTime(vol, t, 0.08);
      // tires only sing when the car is actually moving — brake screech is
      // the high band, the corner skid is the lower, hollower one
      if (brakeGain) {
        brakeGain.gain.setTargetAtTime(braking && p > 0.15 ? 0.07 : 0, t, 0.04);
      }
      if (skidGain) {
        const s = p > 0.15 ? Math.min(0.12, skid * 0.12) : 0;
        skidGain.gain.setTargetAtTime(s, t, 0.05);
      }
      // progressive music: the loop picks up layers as the score climbs
      musicTier =
        score >= TIER_HATS ? 3 : score >= TIER_OCTAVE ? 2 : score >= TIER_LEAD ? 1 : 0;
      if (leadGain) {
        const open = (0.02 + p * 0.09) * (musicTier >= 1 ? 1.6 : 1);
        leadGain.gain.setTargetAtTime(open, t, 0.4);
      }
      if (lead2Gain) {
        lead2Gain.gain.setTargetAtTime(
          musicTier >= 2 ? 0.2 + p * 0.1 : 0,
          t,
          0.8,
        );
      }
    },

    pickup(big) {
      if (!ctx) return;
      const t = ctx.currentTime;
      if (big) {
        blip(t, N.A3, 0.09, "square", 0.14, menuBus ?? undefined);
        blip(t + 0.08, N.E4, 0.09, "square", 0.14, menuBus ?? undefined);
        blip(t + 0.16, N.A4, 0.16, "square", 0.16, menuBus ?? undefined);
      } else {
        blip(t, 660, 0.07, "square", 0.12, menuBus ?? undefined);
        blip(t + 0.06, 880, 0.1, "square", 0.12, menuBus ?? undefined);
      }
    },

    menuMove() {
      if (ctx) blip(ctx.currentTime, 440, 0.05, "square", 0.08, menuBus ?? undefined);
    },
    menuSelect() {
      if (ctx) blip(ctx.currentTime, 660, 0.09, "square", 0.1, menuBus ?? undefined);
    },

    gameOver() {
      if (!ctx || !engGain || !brakeGain) return;
      const t = ctx.currentTime;
      engGain.gain.setTargetAtTime(0, t, 0.1);
      brakeGain.gain.setTargetAtTime(0, t, 0.05);
      if (skidGain) skidGain.gain.setTargetAtTime(0, t, 0.05);
      blip(t, 300, 0.8, "sawtooth", 0.12, menuBus ?? undefined, 70);
    },
  };
}
