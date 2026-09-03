"use client";

/**
 * Twingo Racer — full-screen OutRun-style pseudo-3d driving game.
 * Opened by the START button on the retro CRT (or the mobile ticker
 * bar), which dispatches a "twingo:start" window event. The overlay is
 * opaque and pausable; ESC / ✕ closes it and returns focus to START.
 * The engine itself lives in ./racer and is framework-free.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScoreEntry } from "@/lib/highscore";
import {
  createEngine,
  RACER_HEIGHT,
  RACER_WIDTH,
  type RacerEngine,
  type RacerInput,
  type RacerView,
} from "./racer/engine";
import {
  loadCarFrames,
  loadCockpit,
  loadGasCan,
  makeRoadside,
} from "./racer/sprites";
import { buildTrack } from "./racer/track";

/** render buffer: landscape keeps the native 480×270, portrait phones get
    a taller buffer so the game fills the screen instead of letterboxing
    into a thin strip (pixel budget stays ~130k px for performance) */
function computeBuf(): { w: number; h: number } {
  const aspect = window.innerWidth / window.innerHeight;
  return aspect >= 1
    ? { w: RACER_WIDTH, h: RACER_HEIGHT }
    : { w: 300, h: Math.min(560, Math.round(300 / aspect)) };
}

export function TwingoRacer() {
  const [open, setOpen] = useState(false);
  const [intro, setIntro] = useState(false);
  const [paused, setPaused] = useState(false);
  const [coarse, setCoarse] = useState(false);
  /* camera view: chase cam behind the car or first-person cockpit;
     toggle with V / the CAM touch button — every run starts on the
     chase cam, the choice is per-session only */
  const [view, setView] = useState<RacerView>("chase");
  /* cockpit sprites loaded — without them the toggle stays hidden */
  const [cockpitReady, setCockpitReady] = useState(false);  /* fuel ran dry: engine froze, overlay shows the score + PLAY AGAIN */
  const [gameOver, setGameOver] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  /* elapsed engine time of the finished run — sent as the score's
     plausibility proof */
  const [finalTime, setFinalTime] = useState(0);
  /* leaderboard: top-10 list, initials form state, rank after submit */
  const [board, setBoard] = useState<ScoreEntry[] | null>(null);
  const [initials, setInitials] = useState("");
  const [submitState, setSubmitState] = useState<
    "idle" | "sending" | "done" | "error"
  >("idle");
  const [myRank, setMyRank] = useState<number | null>(null);
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
  /* single-use HMAC token for the current run's score submission;
     null when the highscore service is unavailable — the game then
     silently plays without the leaderboard */
  const tokenRef = useRef<string | null>(null);
  /* mirror of cockpitReady for the key handler — the boot effect's
     listeners close over the first render's toggleView, so the state
     value would be stale there */
  const cockpitReadyRef = useRef(false);
  const keysRef = useRef<RacerInput>({
    left: false,
    right: false,
    gas: false,
    brake: false,
  });

  pausedRef.current = paused;

  /* each run gets a fresh single-use submit token; PLAY AGAIN re-issues.
     On failure the leaderboard UI stays hidden and the game just plays. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: runId intentionally re-issues a token when PLAY AGAIN starts a new run
  useEffect(() => {
    if (!open) return;
    tokenRef.current = null;
    setBoard(null);
    setInitials("");
    setSubmitState("idle");
    setMyRank(null);
    let cancelled = false;
    fetch("/api/highscore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { token: string }) => {
        if (!cancelled) tokenRef.current = d.token;
      })
      .catch(() => {
        if (!cancelled) tokenRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [open, runId]);

  /* submit the run to the leaderboard with this run's single-use token */
  const submitScore = useCallback(async () => {
    const token = tokenRef.current;
    if (!token || initials.length !== 3 || submitState === "sending") return;
    setSubmitState("sending");
    try {
      const r = await fetch("/api/highscore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          token,
          name: initials,
          score: finalScore,
          durationSec: finalTime,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? String(r.status));
      tokenRef.current = null; // consumed — no resubmits
      setMyRank(d.rank);
      setBoard(d.scores);
      setSubmitState("done");
    } catch {
      setSubmitState("error");
    }
  }, [initials, submitState, finalScore, finalTime]);

  /* PLAY AGAIN: drop the engine and re-run the boot effect cleanly */
  const playAgain = useCallback(() => {
    engineRef.current = null;
    gameOverRef.current = false;
    keysRef.current = { left: false, right: false, gas: false, brake: false };
    setGameOver(false);
    setView("chase"); // every run starts on the chase cam
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

  /* V key / CAM button: flip between chase cam and cockpit */
  const toggleView = useCallback(() => {
    if (!cockpitReadyRef.current) return;
    setView((v) => {
      const next: RacerView = v === "chase" ? "cockpit" : "chase";
      if (engineRef.current) engineRef.current.state.view = next;
      return next;
    });
  }, []);

  /* the START buttons dispatch this event */
  useEffect(() => {
    const onStart = () => {
      setBuf(computeBuf());
      setOpen(true);
      setIntro(true);
      setCoarse(window.matchMedia("(pointer: coarse)").matches);
    };
    window.addEventListener("twingo:start", onStart);
    return () => window.removeEventListener("twingo:start", onStart);
  }, []);

  /* rotating the phone mid-run flips the buffer between the landscape and
     portrait shapes; the engine keeps its state and just re-fits (resize) */
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(orientation: landscape)");
    const onFlip = () => setBuf(computeBuf());
    mq.addEventListener("change", onFlip);
    return () => mq.removeEventListener("change", onFlip);
  }, [open]);

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
          setFinalTime(e.state.time);
          setGameOver(true);
          // fetch the current top-10 alongside the overlay
          fetch("/api/highscore")
            .then((r) =>
              r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
            )
            .then((d: { scores: ScoreEntry[] }) => setBoard(d.scores))
            .catch(() => setBoard(null));
        }
      }
      raf = requestAnimationFrame(frame);
    };

    (async () => {
      if (!engineRef.current) {
        const [car, gasCan, cockpit] = await Promise.all([
          loadCarFrames(),
          loadGasCan(),
          loadCockpit(),
        ]);
        if (cancelled) return;
        cockpitReadyRef.current = cockpit !== null;
        setCockpitReady(cockpit !== null);
        const { segments } = buildTrack(427);
        engineRef.current = createEngine({
          segments,
          roadside: makeRoadside(),
          car,
          gasCan,
          cockpit,
          view: "chase",
          width: buf.w,
          height: buf.h,
          clusterTopLeft: window.matchMedia("(pointer: coarse)").matches,
          reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches,
        });
        setView(engineRef.current.state.view);
      } else {
        // orientation flipped mid-run: keep the run, re-fit the renderer
        engineRef.current.resize(buf.w, buf.h);
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
      // V flips between chase cam and first-person cockpit
      if (down && (k === "v" || ev.code === "KeyV")) {
        toggleView();
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

  /* a fresh run token exists and the score would crack the top-10
     (or the board isn't full / hasn't loaded yet) → offer the form */
  const qualifies =
    tokenRef.current !== null &&
    finalScore > 0 &&
    (board == null ||
      board.length < 10 ||
      finalScore > (board[board.length - 1]?.score ?? 0));

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

          {myRank !== null && (
            <div className="racer-leaderboard-rank">RANK #{myRank}</div>
          )}

          {board && board.length > 0 && (
            <ol className="racer-leaderboard">
              {board.map((s, i) => (
                <li
                  key={`${s.name}-${s.at}-${i}`}
                  className={
                    myRank !== null && i === myRank - 1 ? "racer-lb-me" : ""
                  }
                >
                  <span className="racer-lb-name">
                    {String(i + 1).padStart(2, "0")}. {s.name}
                  </span>
                  <span className="racer-lb-score">{s.score}</span>
                </li>
              ))}
            </ol>
          )}

          {qualifies && submitState !== "done" && (
            <div className="racer-initials">
              <label className="racer-initials-label" htmlFor="racer-initials">
                NEW HIGHSCORE — ENTER INITIALS
              </label>
              <div className="racer-initials-row">
                <input
                  id="racer-initials"
                  className="racer-initials-input font-pixel"
                  value={initials}
                  maxLength={3}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="AAA"
                  onChange={(e) =>
                    setInitials(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitScore();
                    e.stopPropagation();
                  }}
                  ref={(el) => el?.focus()}
                />
                <button
                  type="button"
                  className="racer-initials-submit font-pixel"
                  disabled={initials.length !== 3 || submitState === "sending"}
                  onClick={submitScore}
                >
                  {submitState === "sending" ? "..." : "SUBMIT"}
                </button>
              </div>
            </div>
          )}
          {submitState === "error" && (
            <div className="racer-initials-error">SAVE FAILED</div>
          )}

          <button
            type="button"
            className="racer-playagain font-pixel"
            onClick={playAgain}
            ref={(el) => {
              if (!qualifies || submitState === "done") el?.focus();
            }}
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

      {/* key legend — desktop only, hidden once the run is over */}
      {!coarse && !gameOver && (
        <div className="racer-keys font-pixel" aria-hidden="true">
          <div className="racer-keys-row">
            <span className="racer-key">W</span> GAS
          </div>
          <div className="racer-keys-row">
            <span className="racer-key">S</span> BRAKE
          </div>
          <div className="racer-keys-row">
            <span className="racer-key">A</span>
            <span className="racer-key">D</span> STEER
          </div>
          {cockpitReady && (
            <div className="racer-keys-row">
              <span className="racer-key">V</span> CAMERA
            </div>
          )}
          <div className="racer-keys-row">
            <span className="racer-key">R</span> RESTART
          </div>
          <div className="racer-keys-row">
            <span className="racer-key">ESC</span> EXIT
          </div>
        </div>
      )}

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
          {cockpitReady && (
            <div className="racer-touch-group racer-touch-cam">
              <button
                type="button"
                className={`racer-touch-btn racer-cam-btn font-pixel${view === "cockpit" ? " racer-cam-on" : ""}`}
                onClick={toggleView}
              >
                CAM
              </button>
            </div>
          )}
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
