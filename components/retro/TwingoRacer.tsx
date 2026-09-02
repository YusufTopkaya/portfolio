"use client";

/**
 * Twingo Racer — full-screen OutRun-style pseudo-3d driving game.
 * Opened by the START button on the retro CRT (or the mobile ticker
 * bar), which dispatches a "twingo:start" window event. The overlay is
 * opaque and pausable; ESC / ✕ closes it and returns focus to START.
 * The engine itself lives in ./racer and is framework-free.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createEngine,
  RACER_HEIGHT,
  RACER_WIDTH,
  type RacerEngine,
  type RacerInput,
} from "./racer/engine";
import { loadCarFrames, loadGasCan, makeRoadside } from "./racer/sprites";
import { buildTrack } from "./racer/track";

export function TwingoRacer() {
  const [open, setOpen] = useState(false);
  const [intro, setIntro] = useState(false);
  const [paused, setPaused] = useState(false);
  const [coarse, setCoarse] = useState(false);
  /* fuel ran dry: engine froze, overlay shows the score + PLAY AGAIN */
  const [gameOver, setGameOver] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  /* bumped by PLAY AGAIN — re-runs the boot effect with a fresh engine */
  const [runId, setRunId] = useState(0);
  /* render buffer size — portrait phones get a taller buffer so the game
     fills the screen instead of letterboxing into a thin strip */
  const [buf, setBuf] = useState({ w: RACER_WIDTH, h: RACER_HEIGHT });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RacerEngine | null>(null);
  const pausedRef = useRef(false);
  const gameOverRef = useRef(false);
  const keysRef = useRef<RacerInput>({
    left: false,
    right: false,
    gas: false,
    brake: false,
  });

  pausedRef.current = paused;

  /* PLAY AGAIN: drop the engine and re-run the boot effect cleanly */
  const playAgain = useCallback(() => {
    engineRef.current = null;
    gameOverRef.current = false;
    keysRef.current = { left: false, right: false, gas: false, brake: false };
    setGameOver(false);
    setRunId((r) => r + 1);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setPaused(false);
    // return focus to whichever START button is visible
    const btn =
      document.getElementById("crt-start-btn") ??
      document.getElementById("ticker-start-btn");
    btn?.focus();
  }, []);

  /* the START buttons dispatch this event */
  useEffect(() => {
    const onStart = () => {
      const aspect = window.innerWidth / window.innerHeight;
      setBuf(
        aspect >= 1
          ? { w: RACER_WIDTH, h: RACER_HEIGHT }
          : // keep the pixel budget (~130k px) constant for performance
            { w: 300, h: Math.min(560, Math.round(300 / aspect)) },
      );
      setOpen(true);
      setIntro(true);
      setCoarse(window.matchMedia("(pointer: coarse)").matches);
    };
    window.addEventListener("twingo:start", onStart);
    return () => window.removeEventListener("twingo:start", onStart);
  }, []);

  /* engine boot + game loop, alive only while the overlay is open */
  // biome-ignore lint/correctness/useExhaustiveDependencies: runId intentionally re-boots the engine when PLAY AGAIN is pressed
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    document.body.style.overflow = "hidden";
    overlayRef.current?.focus();
    const introTimer = window.setTimeout(() => setIntro(false), 1200);

    let cancelled = false;
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const e = engineRef.current;
      if (e && !pausedRef.current) {
        e.update(dt, keysRef.current);
        e.render(ctx);
        if (e.state.gameOver && !gameOverRef.current) {
          gameOverRef.current = true;
          setFinalScore(Math.floor(e.state.score));
          setGameOver(true);
        }
      }
      raf = requestAnimationFrame(frame);
    };

    (async () => {
      if (!engineRef.current) {
        const [car, gasCan] = await Promise.all([
          loadCarFrames(),
          loadGasCan(),
        ]);
        if (cancelled) return;
        const { segments } = buildTrack(427);
        engineRef.current = createEngine({
          segments,
          roadside: makeRoadside(),
          car,
          gasCan,
          width: buf.w,
          height: buf.h,
          clusterTopLeft: window.matchMedia("(pointer: coarse)").matches,
          reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches,
        });
      }
      raf = requestAnimationFrame(frame);
    })();

    const onKey = (down: boolean) => (ev: KeyboardEvent) => {
      const k = ev.key.toLowerCase();
      // map on both ev.key and the layout-independent physical ev.code —
      // some keyboards drop ev.key repeats under multi-key ghosting while
      // the physical code still comes through
      const map: Record<string, keyof RacerInput> = {
        arrowleft: "left",
        a: "left",
        keya: "left",
        arrowright: "right",
        d: "right",
        keyd: "right",
        arrowup: "gas",
        w: "gas",
        keyw: "gas",
        arrowdown: "brake",
        s: "brake",
        keys: "brake",
      };
      if (down && ev.key === "Escape") {
        close();
        return;
      }
      // R restarts the run instantly: zero score, zero speed, full tank
      if (down && (k === "r" || ev.code === "KeyR")) {
        playAgain();
        return;
      }
      const input = map[k] ?? map[ev.code.toLowerCase()];
      if (!input) return;
      ev.preventDefault();
      keysRef.current[input] = down;
    };
    const kd = onKey(true);
    const ku = onKey(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    // auto-pause when the tab loses focus/visibility — and drop every
    // held key, so a keyup lost while unfocused can't leave the
    // throttle stuck on (or silently off) when the tab returns
    const autoPause = () => {
      if (document.hidden || !document.hasFocus()) {
        keysRef.current = {
          left: false,
          right: false,
          gas: false,
          brake: false,
        };
        setPaused(true);
      }
    };
    document.addEventListener("visibilitychange", autoPause);
    window.addEventListener("blur", autoPause);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(introTimer);
      document.body.style.overflow = "";
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      document.removeEventListener("visibilitychange", autoPause);
      window.removeEventListener("blur", autoPause);
      // release any held keys so the car doesn't drive off on its own
      keysRef.current = { left: false, right: false, gas: false, brake: false };
    };
  }, [open, close, buf.w, buf.h, runId]);

  const bindTouch = (key: keyof RacerInput) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      // can throw for synthetic/legacy pointers — capture is only a
      // nice-to-have for hold-tracking, never fatal
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      keysRef.current[key] = true;
      if (paused) setPaused(false);
    },
    onPointerUp: () => {
      keysRef.current[key] = false;
    },
    onPointerCancel: () => {
      keysRef.current[key] = false;
    },
  });

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      role="dialog"
      aria-label="Twingo Racer — OutRun style driving game"
      className="racer-overlay"
      onClick={() => paused && setPaused(false)}
      onKeyDown={() => paused && setPaused(false)}
    >
      <div className="racer-crt">
        <div className="racer-screen">
          <canvas
            ref={canvasRef}
            width={buf.w}
            height={buf.h}
            className="racer-canvas"
            style={{
              width: `min(calc(100vw - var(--racer-bezel-x)), calc((100vh - var(--racer-bezel-y)) * ${buf.w / buf.h}))`,
            }}
          />
          {/* glass effects live ON the screen: scanlines, corner vignette,
              hazy CRT grain creeping in from the bezel edges, and a faint
              diagonal glare */}
          <div className="racer-scanlines" aria-hidden="true" />
          <div className="racer-vignette" aria-hidden="true" />
          <div className="racer-grain" aria-hidden="true" />
          <div className="racer-glare" aria-hidden="true" />
        </div>
        <div className="racer-crt-chin" aria-hidden="true">
          <span className="racer-crt-brand font-pixel">TWINGO-427</span>
          <span className="racer-crt-led" />
        </div>
      </div>

      {/* no DOM HUD — speed and score live on the in-canvas LCD cluster */}

      {intro && (
        <div className="racer-ready font-pixel" aria-hidden="true">
          READY...
        </div>
      )}
      {paused && (
        <div className="racer-paused font-pixel" role="status">
          PAUSED — CLICK TO RESUME
        </div>
      )}
      {gameOver && (
        <div className="racer-gameover font-pixel" role="alert">
          <div className="racer-gameover-title">GAME OVER</div>
          <div className="racer-gameover-score">SCORE {finalScore}</div>
          <button
            type="button"
            className="racer-playagain font-pixel"
            onClick={playAgain}
            ref={(el) => el?.focus()}
          >
            PLAY AGAIN
          </button>
        </div>
      )}

      <button
        type="button"
        className="racer-close font-pixel"
        onClick={close}
        aria-label="Close game"
      >
        ✕
      </button>

      {coarse && (
        <div className="racer-touch" aria-hidden="true">
          <div className="racer-touch-group">
            <button
              type="button"
              className="racer-touch-btn font-pixel"
              {...bindTouch("left")}
            >
              ◀
            </button>
            <button
              type="button"
              className="racer-touch-btn font-pixel"
              {...bindTouch("right")}
            >
              ▶
            </button>
          </div>
          <div className="racer-touch-group">
            <button
              type="button"
              className="racer-touch-btn font-pixel"
              {...bindTouch("gas")}
            >
              ▲
            </button>
            <button
              type="button"
              className="racer-touch-btn font-pixel"
              {...bindTouch("brake")}
            >
              ▼
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
