/**
 * Procedural audio for the Twingo racer — pure Web Audio, zero assets.
 *
 * The engine voice is modeled on the real car, but tuned angry — sport
 * exhaust spec: the Mk1 Twingo's D7F is a 1149 cc 8v inline-FOUR, so the
 * four-stroke exhaust firing frequency is RPM × cylinders / 120 = RPM / 30:
 * ~28 Hz at the 850 rpm idle, 200 Hz at the 6000 rpm redline. Harmonics of
 * that pulse (sub sine, main saw, the dominant 2nd harmonic, plus a
 * phase-locked sub-octave saw for fatness — a detuned unison would beat
 * against the main saw at a rate that climbs with revs) run through a
 * resonant lowpass
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
  /** tab hidden / screen locked: suspend the whole context so NOTHING
      plays while the user can't see the game; resume on return */
  setHidden(hidden: boolean): void;
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
    /** BOOST burning: NOS whoosh on the rising edge, a rev-following
        whistle while it lasts, blow-off sigh at the end */
    boost: boolean,
  ): void;
  pickup(big: boolean, golden?: boolean): void;
  /** streak ladder step crossed (+3/+5/+8 s at 3/5/each 10 — repeats
      every 10 cans) — rising fanfare, deeper steps climb higher */
  streak(streak: number): void;
  /** crash respawn (stranded off-road / pothole): deep thud + rattle */
  crash(): void;
  /** third crash = fatal: the engine sputters and dies — slowing putters
      and a final cough as the run ends in a driverless coast */
  breakdown(): void;
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
  N.A1,
  null,
  N.A1,
  null,
  N.C2,
  null,
  N.A1,
  null,
  N.G1,
  null,
  N.G1,
  null,
  N.A1,
  null,
  N.E2,
  null,
  N.A1,
  null,
  N.A1,
  null,
  N.C2,
  null,
  N.A1,
  null,
  N.G1,
  null,
  N.G1,
  null,
  N.A1,
  null,
  N.D2,
  null,
];
/* lead arpeggio on 16ths — the Am pentatonic climb that never resolves */
const LEAD: (number | null)[] = [
  N.A3,
  null,
  N.C4,
  N.E4,
  N.A4,
  null,
  N.E4,
  N.C4,
  N.G4,
  null,
  N.E4,
  N.C4,
  N.D4,
  null,
  N.E4,
  null,
  N.A3,
  null,
  N.C4,
  N.E4,
  N.A4,
  null,
  N.C5,
  N.A4,
  N.G4,
  null,
  N.E4,
  N.D4,
  N.C4,
  null,
  N.D4,
  null,
];

/* score thresholds where the loop picks up another layer (halved with
   the ×0.5 score scale — same km marks as before) */
const TIER_LEAD = 12_500; // lead arpeggio opens up
const TIER_OCTAVE = 30_000; // lead doubled an octave up
const TIER_HATS = 50_000; // hats go double-time

/* engine model: D7F 1149 cc inline-4 four-stroke, ~850 rpm idle, 6000 rpm
   redline — firing frequency = RPM/30, so 28-200 Hz */
const IDLE_HZ = 850 / 30;
const REDLINE_HZ = 6000 / 30;

/** 0-10 slider → gain, with a perceptual curve so 5 feels like "half" */
const levelToGain = (level: number): number =>
  (Math.max(0, Math.min(10, level)) / 10) ** 1.5;

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

  // boost voice: muscle first — a detuned saw growl + lowpassed air roar
  // carry the sound, the thin whistle sine is just a garnish; all under
  // boostGain, gated by drive() (NOS whoosh on activation, blow-off sigh
  // at the end)
  let boostWhistle: OscillatorNode | null = null;
  let boostGrowl: OscillatorNode | null = null;
  let boostGrowlFilter: BiquadFilterNode | null = null;
  let boostAirFilter: BiquadFilterNode | null = null;
  let boostGain: GainNode | null = null;
  let boostWasOn = false; // edge detection for the whoosh / blow-off

  // music: per-part gains so speed/score can open up layers
  let leadGain: GainNode | null = null;
  let lead2Gain: GainNode | null = null; // octave-up doubler
  let schedTimer: ReturnType<typeof setInterval> | null = null;
  let nextTime = 0;
  let step = 0;
  let musicTier = 0; // 0..3, driven by score
  let wasShifting = false; // rising edge fires the clutch thump
  let wasThrottle = false; // falling edge fires the overrun crackle
  // setHidden(false) defers the context wake to the next user-driven call
  // so tab-return frames don't pay the resume cost (see setHidden)
  let hiddenDeferred = false;
  const ensureRunning = () => {
    if (hiddenDeferred && ctx) {
      hiddenDeferred = false;
      void ctx.resume();
    }
  };

  const makeNoise = (c: AudioContext): AudioBufferSourceNode => {
    // 4 s buffer: a 1 s loop repeats audibly as a warble under the exhaust
    const len = c.sampleRate * 4;
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

  /** filtered noise one-shot with a swept bandpass — the boost whoosh and
      the blow-off are the same machine inhaling vs exhaling */
  const noiseBurst = (
    at: number,
    dur: number,
    fromFreq: number,
    toFreq: number,
    vol: number,
    q = 1.2,
  ) => {
    if (!ctx || !engineBus) return;
    const src = makeNoise(ctx);
    src.loop = false;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = q;
    bp.frequency.setValueAtTime(fromFreq, at);
    bp.frequency.exponentialRampToValueAtTime(toFreq, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(bp).connect(g).connect(engineBus);
    src.start(at);
    src.stop(at + dur + 0.02);
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
      if (lead2Gain) blip(at, lead * 2, STEP * 0.7, "square", 0.3, lead2Gain);
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
        // engFat plays the SUB-OCTAVE (f0/2), set in drive(): a detuned
        // unison saw beats against the main saw at a rate that climbs with
        // revs — that warble was audible at cruise. An octave below is
        // phase-locked, so it fattens without ever beating.
        engFilter = ctx.createBiquadFilter();
        engFilter.type = "lowpass";
        engFilter.frequency.value = 400;
        engFilter.Q.value = 1.8; // resonance at the cutoff adds the rasp
        preDrive = ctx.createGain();
        preDrive.gain.value = 0.7;
        const shaper = ctx.createWaveShaper();
        shaper.curve = makeDistCurve(3);
        shaper.oversample = "4x"; // push the clip aliasing above hearing
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

        // boost voice: muscle first — a detuned saw growl + lowpassed air
        // roar carry the sound, the thin whistle sine is just a garnish
        // on top; all of it under a shared gain, silent until drive()
        // opens it while boostT burns
        boostWhistle = ctx.createOscillator();
        boostWhistle.type = "sine";
        boostWhistle.frequency.value = 500;
        const whistleG = ctx.createGain();
        whistleG.gain.value = 0.18;
        boostWhistle.connect(whistleG);
        boostGrowl = ctx.createOscillator();
        boostGrowl.type = "sawtooth";
        boostGrowl.frequency.value = 70;
        boostGrowlFilter = ctx.createBiquadFilter();
        boostGrowlFilter.type = "lowpass";
        boostGrowlFilter.frequency.value = 600;
        boostGrowlFilter.Q.value = 1.4;
        const growlG = ctx.createGain();
        growlG.gain.value = 1;
        boostGrowl.connect(boostGrowlFilter).connect(growlG);
        const boostAir = makeNoise(ctx);
        boostAirFilter = ctx.createBiquadFilter();
        boostAirFilter.type = "lowpass";
        boostAirFilter.frequency.value = 1400;
        boostAirFilter.Q.value = 0.8;
        const airG = ctx.createGain();
        airG.gain.value = 0.85;
        boostAir.connect(boostAirFilter).connect(airG);
        boostGain = ctx.createGain();
        boostGain.gain.value = 0;
        whistleG.connect(boostGain);
        growlG.connect(boostGain);
        airG.connect(boostGain);
        boostGain.connect(engineBus);
        boostWhistle.start();
        boostGrowl.start();
        boostAir.start();

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
      if (engGain && ctx)
        engGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      if (rumbleGain && ctx)
        rumbleGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      if (brakeGain && ctx)
        brakeGain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      if (skidGain && ctx)
        skidGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      if (boostGain && ctx)
        boostGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
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
        if (boostGain) boostGain.gain.setTargetAtTime(0, t, 0.03);
      }
    },

    setHidden(h) {
      if (!ctx) return;
      // suspended contexts freeze currentTime, so the music scheduler's
      // 0.6 s lookahead just waits — resume continues seamlessly
      if (h) {
        void ctx.suspend();
      } else {
        // don't pay the resume cost inside the visibilitychange handler:
        // the tab-return frames are the jankiest the browser produces, so
        // the wake is deferred to the next user-driven entry point
        // (drive/menuSelect/… via ensureRunning). Muted = master gain 0
        // anyway; a stopped context has no scheduled sources
        hiddenDeferred = true;
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

    drive(p, throttle, braking, skid, rpm01, shifting, score, boost) {
      ensureRunning();
      if (
        !ctx ||
        !engSub ||
        !engMain ||
        !engHarm ||
        !engFat ||
        !engFilter ||
        !engGain
      )
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
      engFat.frequency.setTargetAtTime(f0 / 2, t, 0.03);
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
      // boost voice: NOS whoosh + a sub-bass punch on the rising edge,
      // blow-off sigh on the falling one, and while it burns a detuned
      // saw growl + lowpassed air roar under a faint whistle — the roar
      // is the clock you hear draining
      if (boost && !boostWasOn) {
        noiseBurst(t, 0.45, 700, 3800, 0.15, 1.0);
        blip(t, 130, 0.3, "sine", 0.2, engineBus ?? undefined, 45);
      }
      if (!boost && boostWasOn) noiseBurst(t, 0.3, 3400, 1300, 0.11, 1.6);
      boostWasOn = boost;
      if (boostGain) {
        // EXPERIMENT: full exhaust underneath + the boost voice layered on
        // top (louder than the original garnish mix, nothing ducks)
        boostGain.gain.setTargetAtTime(
          boost ? (0.08 + loadSmooth * 0.04) * quiet : 0,
          t,
          0.06,
        );
      }
      if (boostWhistle) {
        boostWhistle.frequency.setTargetAtTime(500 + r * 900, t, 0.08);
      }
      if (boostGrowl) {
        boostGrowl.frequency.setTargetAtTime(65 + r * 130, t, 0.08);
      }
      if (boostGrowlFilter) {
        boostGrowlFilter.frequency.setTargetAtTime(500 + r * 700, t, 0.1);
      }
      if (boostAirFilter) {
        boostAirFilter.frequency.setTargetAtTime(1200 + r * 1800, t, 0.1);
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

    pickup(big, golden) {
      if (!ctx) return;
      const t = ctx.currentTime;
      if (golden) {
        // coin-chime: a bright climb past the big can's arpeggio — the
        // rarest pickup gets the highest landing note
        blip(t, N.E4, 0.07, "square", 0.14, menuBus ?? undefined);
        blip(t + 0.06, N.A4, 0.07, "square", 0.14, menuBus ?? undefined);
        blip(t + 0.12, N.C5, 0.09, "square", 0.15, menuBus ?? undefined);
        blip(t + 0.18, 659.25, 0.14, "square", 0.16, menuBus ?? undefined);
      } else if (big) {
        blip(t, N.A3, 0.09, "square", 0.14, menuBus ?? undefined);
        blip(t + 0.08, N.E4, 0.09, "square", 0.14, menuBus ?? undefined);
        blip(t + 0.16, N.A4, 0.16, "square", 0.16, menuBus ?? undefined);
      } else {
        blip(t, 660, 0.07, "square", 0.12, menuBus ?? undefined);
        blip(t + 0.06, 880, 0.1, "square", 0.12, menuBus ?? undefined);
      }
    },

    streak(streak) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const lap = streak % 10 === 0 ? 10 : streak % 10;
      // rising arpeggio — the +8 s step at each multiple of 10 climbs
      // further and lands higher than the mid-lap steps
      const notes =
        lap === 10
          ? [N.C4, N.E4, N.A4, N.C5]
          : lap === 5
            ? [N.E4, N.A4, N.C5]
            : [N.E4, N.A4];
      for (const [i, f] of notes.entries()) {
        blip(t + i * 0.07, f, 0.12, "square", 0.14, menuBus ?? undefined);
      }
    },

    crash() {
      if (!ctx || !engineBus) return;
      const t = ctx.currentTime;
      // body hit: a deep lowpassed thud, then a short metallic rattle —
      // suspension bottoming out in the hole / on the grass
      const thud = makeNoise(ctx);
      const f1 = ctx.createBiquadFilter();
      f1.type = "lowpass";
      f1.frequency.value = 120;
      const g1 = ctx.createGain();
      g1.gain.setValueAtTime(0.5, t);
      g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      thud.connect(f1).connect(g1).connect(engineBus);
      thud.start(t);
      thud.stop(t + 0.3);
      const rattle = makeNoise(ctx);
      const f2 = ctx.createBiquadFilter();
      f2.type = "bandpass";
      f2.frequency.value = 1800;
      f2.Q.value = 2;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.12, t + 0.02);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      rattle.connect(f2).connect(g2).connect(engineBus);
      rattle.start(t + 0.02);
      rattle.stop(t + 0.24);
    },

    breakdown() {
      if (!ctx || !engineBus) return;
      const t = ctx.currentTime;
      // dying engine: a handful of low putters with widening gaps (the
      // firing rate stalling out), each weaker than the last, then one
      // final unfiltered cough of noise — silence after that is the
      // gameOver() fade's job
      const putters: [number, number, number][] = [
        // offset, frequency, volume
        [0, 90, 0.3],
        [0.16, 74, 0.26],
        [0.38, 58, 0.22],
        [0.68, 44, 0.17],
        [1.1, 32, 0.12],
      ];
      for (const [off, freq, vol] of putters) {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, t + off);
        g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.12);
        osc.connect(g).connect(engineBus);
        osc.start(t + off);
        osc.stop(t + off + 0.14);
      }
      const cough = makeNoise(ctx);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 1.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
      cough.connect(f).connect(g).connect(engineBus);
      cough.start(t + 1.4);
      cough.stop(t + 2.0);
    },

    menuMove() {
      ensureRunning();
      if (ctx)
        blip(ctx.currentTime, 440, 0.05, "square", 0.08, menuBus ?? undefined);
    },
    menuSelect() {
      ensureRunning();
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
      if (boostGain) boostGain.gain.setTargetAtTime(0, t, 0.05);
      blip(t, 300, 0.8, "sawtooth", 0.12, menuBus ?? undefined, 70);
    },
  };
}
