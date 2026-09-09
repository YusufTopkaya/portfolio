/**
 * Procedural audio for the Twingo racer — pure Web Audio, zero assets.
 *
 * The engine voice is modeled on the real car, but tuned angry — sport
 * exhaust spec: the Mk1 Twingo's D7F is a 1149 cc 8v inline-FOUR, so the
 * four-stroke exhaust firing frequency is RPM × cylinders / 120 = RPM / 30:
 * ~28 Hz at the 850 rpm idle, 200 Hz at the 6000 rpm redline. Harmonics of
 * that pulse (sub sine, main saw, the dominant 2nd harmonic, plus a
 * slightly detuned second saw for fatness) run through a resonant lowpass
 * into a waveshaper whose drive follows throttle LOAD — a pinned throttle
 * growls, a lifted one goes soft. Lifting off at revs cracks off a burst
 * of overrun pops, and at the redline the rev limiter stutters the
 * ignition in an irregular cut pattern (a steady gate warbles). A
 * filtered-noise rumble sits under it all for body.
 *
 * The gearbox does the rest for free: rpm01 is wheel-speed over the
 * current gear's top, so an upshift drops the revs by the ratio gap on
 * its own, a downshift kicks them up, and the 0.28 s shift cut just ducks
 * the load (plus a soft clutch thump) instead of faking a pitch dip.
 *
 * Music is an infinite synthwave loop that gets progressively denser as
 * the score climbs (bass+hat → lead → octave doubler → double-time hats).
 * Brake and tire-skid screeches are bandpass noise. Menus are square blips.
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
  /** pause menu: silence the car (music keeps playing) */
  setPaused(paused: boolean): void;
  /** cockpit view: muffle the car — the cabin eats the highs and the
      outside tire noise, the low-end drone comes through */
  setInterior(interior: boolean): void;
  setVolumes(v: RacerVolumes): void;
  getVolumes(): RacerVolumes;
  /**
   * per-frame drive state: engine voice (rpm01 = revs inside the current
   * gear as wheel-speed/gear-top, shifting = throttle lifted), brake/tire
   * screech, music intensity
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

/* engine model: D7F 1149 cc inline-4 four-stroke, ~850 rpm idle, 6000 rpm
   redline — firing frequency = RPM/30, so 28-200 Hz */
const IDLE_HZ = 850 / 30;
const REDLINE_HZ = 6000 / 30;

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

  // engine voice: sub sine + main saw + 2nd-harmonic saw + a detuned fat
  // saw through a resonant load-driven lowpass into a waveshaper, with a
  // filtered-noise exhaust rumble beneath
  let engSub: OscillatorNode | null = null;
  let engMain: OscillatorNode | null = null;
  let engHarm: OscillatorNode | null = null;
  let engFat: OscillatorNode | null = null;
  let engFilter: BiquadFilterNode | null = null;
  let preDrive: GainNode | null = null;
  let engGain: GainNode | null = null;
  let rumbleGain: GainNode | null = null;
  let loadSmooth = 0; // throttle load, eased toward the target each frame
  let carSilent = false; // pause menu / game over: the car makes no sound
  let interior = false; // cockpit view: muffled engine, quiet tires

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
  let wasShifting = false; // rising edge fires the clutch thump
  let wasThrottle = false; // falling edge fires the overrun crackle

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

  /** soft-clip curve for the exhaust growl — y = (1+k)x/(1+k|x|) */
  const makeDistCurve = (k: number): Float32Array<ArrayBuffer> => {
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  };

  /** soft clutch/gear thump: a short burst of heavily lowpassed noise */
  const clunk = () => {
    if (!ctx || !engineBus) return;
    const t = ctx.currentTime;
    const src = makeNoise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 160;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(f).connect(g).connect(engineBus);
    src.start(t);
    src.stop(t + 0.09);
  };

  /** overrun crackle: lifting off at revs pops a handful of bandpassed
      noise bursts — the Warex pops of unburnt fuel hitting a hot exhaust */
  const crackle = (r: number) => {
    if (!ctx || !engineBus) return;
    const t0 = ctx.currentTime;
    const pops = 3 + Math.floor(r * 4);
    let at = t0 + 0.02;
    for (let i = 0; i < pops; i++) {
      const src = makeNoise(ctx);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 700 + Math.random() * 500;
      f.Q.value = 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05 + Math.random() * 0.07, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
      src.connect(f).connect(g).connect(engineBus);
      src.start(at);
      src.stop(at + 0.06);
      at += 0.03 + Math.random() * 0.06;
    }
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

        // engine voice chain: 4 voices of the firing pulse through a
        // resonant lowpass into a load-driven waveshaper
        engSub = ctx.createOscillator();
        engSub.type = "sine";
        engMain = ctx.createOscillator();
        engMain.type = "sawtooth";
        engHarm = ctx.createOscillator();
        engHarm.type = "sawtooth";
        engFat = ctx.createOscillator();
        engFat.type = "sawtooth";
        engFat.detune.value = 10; // cents off the main saw — chorus fatness
        engFilter = ctx.createBiquadFilter();
        engFilter.type = "lowpass";
        engFilter.frequency.value = 400;
        engFilter.Q.value = 2.2; // resonance at the cutoff adds the rasp
        preDrive = ctx.createGain();
        preDrive.gain.value = 0.7;
        const shaper = ctx.createWaveShaper();
        shaper.curve = makeDistCurve(3);
        shaper.oversample = "2x";
        engGain = ctx.createGain();
        engGain.gain.value = 0;
        const mix = ctx.createGain();
        mix.gain.value = 1;
        const subG = ctx.createGain(); // low-end body of the exhaust
        subG.gain.value = 0.6;
        const harmG = ctx.createGain(); // the 2nd harmonic dominates real
        harmG.gain.value = 0.55; // exhaust recordings — keep it forward
        const fatG = ctx.createGain();
        fatG.gain.value = 0.45;
        engSub.connect(subG).connect(mix);
        engMain.connect(mix);
        engHarm.connect(harmG).connect(mix);
        engFat.connect(fatG).connect(mix);
        mix.connect(engFilter).connect(preDrive);
        preDrive.connect(shaper).connect(engGain).connect(engineBus);
        engSub.start();
        engMain.start();
        engHarm.start();
        engFat.start();

        // exhaust rumble: noise under a deep lowpass, follows load
        const rumble = makeNoise(ctx);
        const rf = ctx.createBiquadFilter();
        rf.type = "lowpass";
        rf.frequency.value = 220;
        rumbleGain = ctx.createGain();
        rumbleGain.gain.value = 0;
        rumble.connect(rf).connect(rumbleGain).connect(engineBus);
        rumble.start();

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
      if (rumbleGain && ctx)
        rumbleGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      if (brakeGain && ctx)
        brakeGain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      if (skidGain && ctx)
        skidGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      if (ctx) void ctx.suspend();
    },

    setMuted(m) {
      muted = m;
      if (master && ctx)
        master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
    },

    setPaused(p) {
      if (!ctx || p === carSilent) return;
      carSilent = p;
      const t = ctx.currentTime;
      if (p) {
        // pause menu: the car falls silent, the music keeps playing
        if (engGain) engGain.gain.setTargetAtTime(0, t, 0.05);
        if (rumbleGain) rumbleGain.gain.setTargetAtTime(0, t, 0.05);
        if (brakeGain) brakeGain.gain.setTargetAtTime(0, t, 0.03);
        if (skidGain) skidGain.gain.setTargetAtTime(0, t, 0.03);
      }
    },

    setInterior(i) {
      interior = i;
    },

    setVolumes(v) {
      volumes = { ...v };
      if (!ctx) return;
      const t = ctx.currentTime;
      if (musicBus)
        musicBus.gain.setTargetAtTime(levelToGain(v.music), t, 0.02);
      if (engineBus)
        engineBus.gain.setTargetAtTime(levelToGain(v.engine), t, 0.02);
      if (menuBus) menuBus.gain.setTargetAtTime(levelToGain(v.menu), t, 0.02);
    },

    getVolumes() {
      return { ...volumes };
    },

    drive(p, throttle, braking, skid, rpm01, shifting, score) {
      if (!ctx || !engSub || !engMain || !engHarm || !engFat || !engFilter || !engGain)
        return;
      const t = ctx.currentTime;
      carSilent = false;

      // shift edge: clutch thump as the next gear goes in
      if (shifting && !wasShifting) clunk();
      wasShifting = shifting;

      // rev limiter: pinned at the gear's top with the throttle down, the
      // ignition cuts in a hard ~18 Hz bounce (5th pins at the 180 ceiling,
      // gears 1-4 just kiss it before the upshift)
      const r = Math.max(0, Math.min(1, rpm01));
      const limited = r >= 0.97 && throttle && !shifting;

      // lift-off edge at revs: overrun crackle (Warex pops)
      if (!throttle && wasThrottle && r > 0.45 && !shifting) crackle(r);
      wasThrottle = throttle;

      // throttle load drives loudness/brightness more than revs do — a
      // pinned throttle barks at any rpm, a lifted one goes soft and dark
      const loadTarget = shifting ? 0 : throttle ? 1 : 0.15;
      loadSmooth += (loadTarget - loadSmooth) * 0.18;

      // waveshaper drive follows load — more gas, more growl
      if (preDrive)
        preDrive.gain.setTargetAtTime(0.7 + loadSmooth * 1.8, t, 0.08);

      // firing pulse: 850-6000 rpm → 28-200 Hz, with a faint idle wobble
      const wobble = 1 + 0.01 * Math.sin(t * 12.7) * (1 - r * 0.8);
      const f0 = (IDLE_HZ + r * (REDLINE_HZ - IDLE_HZ)) * wobble;
      engSub.frequency.setTargetAtTime(f0, t, 0.03);
      engMain.frequency.setTargetAtTime(f0, t, 0.03);
      engHarm.frequency.setTargetAtTime(f0 * 2, t, 0.03);
      engFat.frequency.setTargetAtTime(f0, t, 0.03);
      // cockpit: the cabin eats the highs and softens everything; the
      // low-end drone survives (real interior acoustics)
      const muffle = interior ? 0.42 : 1;
      const quiet = interior ? 0.55 : 1;
      const tireQuiet = interior ? 0.5 : 1;
      engFilter.frequency.setTargetAtTime(
        (260 + r * 1300 + loadSmooth * 700) * muffle,
        t,
        0.06,
      );
      let vol = (0.028 + loadSmooth * 0.055 + r * 0.015) * quiet;
      if (limited) {
        // irregular ignition cut: two incommensurate sines gate single
        // firing events, so a long pinned run stutters like a real limiter
        // instead of ringing — a steady 18 Hz square gate warbles
        if (Math.sin(t * 113.0) * Math.sin(t * 31.7) > 0.3) vol *= 0.3;
      }
      engGain.gain.setTargetAtTime(vol, t, limited ? 0.012 : 0.05);
      if (rumbleGain) {
        rumbleGain.gain.setTargetAtTime(
          loadSmooth * (0.02 + r * 0.05) * (interior ? 1.25 : 1),
          t,
          0.08,
        );
      }
      // tires only sing when the car is actually moving — brake screech is
      // the high band, the corner skid is the lower, hollower one; both
      // are outside the cabin in cockpit view
      if (brakeGain) {
        brakeGain.gain.setTargetAtTime(
          braking && p > 0.15 ? 0.07 * tireQuiet : 0,
          t,
          0.04,
        );
      }
      if (skidGain) {
        const s = p > 0.15 ? Math.min(0.12, skid * 0.12) * tireQuiet : 0;
        skidGain.gain.setTargetAtTime(s, t, 0.05);
      }
      // progressive music: the loop picks up layers as the score climbs
      musicTier =
        score >= TIER_HATS
          ? 3
          : score >= TIER_OCTAVE
            ? 2
            : score >= TIER_LEAD
              ? 1
              : 0;
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
      if (ctx)
        blip(ctx.currentTime, 440, 0.05, "square", 0.08, menuBus ?? undefined);
    },
    menuSelect() {
      if (ctx)
        blip(ctx.currentTime, 660, 0.09, "square", 0.1, menuBus ?? undefined);
    },

    gameOver() {
      if (!ctx || !engGain || !brakeGain) return;
      const t = ctx.currentTime;
      // out of fuel = engine off, not idling
      carSilent = true;
      engGain.gain.setTargetAtTime(0, t, 0.1);
      if (rumbleGain) rumbleGain.gain.setTargetAtTime(0, t, 0.1);
      brakeGain.gain.setTargetAtTime(0, t, 0.05);
      if (skidGain) skidGain.gain.setTargetAtTime(0, t, 0.05);
      blip(t, 300, 0.8, "sawtooth", 0.12, menuBus ?? undefined, 70);
    },
  };
}
