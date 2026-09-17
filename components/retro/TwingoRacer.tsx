"use client";

/**
 * Twingo Racer — full-screen OutRun-style pseudo-3d driving game.
 * Opened by the START button on the retro CRT (or the mobile ticker
 * bar), which dispatches a "twingo:start" window event. The overlay
 * first lands on a title screen (retro artwork with clickable START /
 * LEADERBOARD hit areas, ↑/↓ + Enter work too); the engine boots only
 * once START is pressed there. ESC / ✕ closes it and returns focus to
 * the CRT START button. The engine itself lives in ./racer and is
 * framework-free.
 */

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScoreEntry, ScorePeriod } from "@/lib/highscore";
import {
  createRacerAudio,
  type RacerAudio,
  type RacerVolumes,
} from "./racer/audio";
import { bracketForScore, nextBracket } from "./racer/brackets";
import {
  createEngine,
  ENGINE_CONSTANTS,
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
  tintGold,
} from "./racer/sprites";
import { createTrackGenerator } from "./racer/track";
import {
  analyzeTrack,
  type TrackStats,
  trackDifficulty,
} from "./racer/trackstats";

/** render buffer: landscape keeps the native 480×270, portrait phones get
    a taller buffer so the game fills the screen instead of letterboxing
    into a thin strip (pixel budget stays ~130k px for performance) */
function computeBuf(): { w: number; h: number } {
  const aspect = window.innerWidth / window.innerHeight;
  return aspect >= 1
    ? { w: RACER_WIDTH, h: RACER_HEIGHT }
    : { w: 300, h: Math.min(560, Math.round(300 / aspect)) };
}

/* Turkey is permanently on UTC+3 (no DST since 2016), so the daily
   track flips at midnight TR time and the title-screen countdown can
   speak the player's own clock */
const TR_OFFSET_MS = 3 * 3600000;
const turkeyDay = () => Math.floor((Date.now() + TR_OFFSET_MS) / 86400000);

/** "HH:MM:SS" until the next TR midnight — the daily track reset */
function resetCountdown(): string {
  const next = (turkeyDay() + 1) * 86400000 - TR_OFFSET_MS;
  const s = Math.max(0, Math.floor((next - Date.now()) / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/* leaderboard bracket gem: a hand-drawn 9×9 pixel diamond rendered as a
   crisp-edges SVG. The previous rotated-square approach anti-aliased at
   the fractional offsets produced by the panel's translate(-50%,-50%)
   centering, so identical rows looked vertically misaligned. */
const GEM_PATH =
  "M4 0h1v1h1v1h1v1h1v1h1v1H8v1H7v1H6v1H5v1H4v-1H3v-1H2v-1H1v-1H0v-1H1v-1H2v-1H3v-1H4v-1Z";

function BracketGem({ score }: { score: number }) {
  const b = bracketForScore(score);
  return (
    <span
      className="racer-lb-gem-wrap"
      data-bracket={b.name}
      style={{ "--gem-color": b.color } as CSSProperties}
    >
      <svg
        className="racer-lb-gem"
        role="img"
        aria-label={b.name}
        width="9"
        height="9"
        viewBox="0 0 9 9"
        shapeRendering="crispEdges"
      >
        <path d={GEM_PATH} fill={b.color} />
      </svg>
    </span>
  );
}

export function TwingoRacer() {
  const [open, setOpen] = useState(false);
  /* the overlay opens on the title screen; the engine only boots once
     START is pressed (or PLAY AGAIN after a run) */
  const [screen, setScreen] = useState<"title" | "playing">("title");
  /* title screen: which artwork button is armed for Enter, and whether
     the read-only leaderboard panel is open over the title */
  const [titleSel, setTitleSel] = useState<"start" | "board" | "settings">(
    "start",
  );
  const [titleBoard, setTitleBoard] = useState(false);
  /* TODAY'S TRACK: 1-5 star difficulty card of the first ~3 km, rated
     once per session from the same daily seed the engine races on */
  const [trackStats, setTrackStats] = useState<TrackStats | null>(null);
  const [boardError, setBoardError] = useState(false);
  const [intro, setIntro] = useState(false);
  const [paused, setPaused] = useState(false);
  /* pause menu (ESC / ⏸): freezes the run and offers RESUME / STATS /
     SETTINGS / RESTART / QUIT. Distinct from the plain auto-pause banner
     shown on tab blur */
  const [pauseMenu, setPauseMenu] = useState(false);
  const [pauseSel, setPauseSel] = useState<
    "resume" | "stats" | "settings" | "restart" | "quit"
  >("resume");
  /* STATS option expands the current run's numbers inside the menu */
  const [pauseStats, setPauseStats] = useState(false);
  const [coarse, setCoarse] = useState(false);
  /* FPS counter — F toggles it (in the desktop key legend); sampled 2×/s
     so the overlay doesn't re-render every frame */
  const [showFps, setShowFps] = useState(false);
  const [fps, setFps] = useState(0);
  /* all game audio is synthesized (Web Audio, no assets); the context is
     born on the START gesture. Mute persists across sessions */
  const audioRef = useRef<RacerAudio | null>(null);
  const [muted, setMuted] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem("twingo:muted") === "1",
  );
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  /* per-channel volumes (0-10 each) — music / engine / menu effects get
     their own bus under the master mute; persisted across sessions */
  const [vols, setVols] = useState<RacerVolumes>(() => {
    const clamp = (n: unknown) =>
      Math.max(0, Math.min(10, Math.round(Number(n) || 0)));
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("twingo:vol");
        if (raw) {
          const p = JSON.parse(raw) as Partial<RacerVolumes>;
          return {
            music: clamp(p.music ?? 8),
            engine: clamp(p.engine ?? 8),
            menu: clamp(p.menu ?? 8),
          };
        }
      } catch {}
    }
    return { music: 8, engine: 8, menu: 8 };
  });
  const volsRef = useRef(vols);
  volsRef.current = vols;
  /* sound settings panel: reachable from the title screen (chip under the
     artwork) and from the pause menu (SETTINGS option). settingsRow is
     the armed slider when it's open */
  const [titleSettingsOpen, setTitleSettingsOpen] = useState(false);
  const [pauseSettingsOpen, setPauseSettingsOpen] = useState(false);
  const [settingsRow, setSettingsRow] = useState(0);
  /* camera view: chase cam behind the car or first-person cockpit;
     toggle with V / the CAM touch button — every run starts on the
     chase cam, the choice is per-session only */
  const [view, setView] = useState<RacerView>("chase");
  /* tilt steering (mobile option in SETTINGS): the phone becomes the
     wheel — the deviceorientation stream feeds an analog steer value
     into the input bag. Persisted across sessions; OFF by default */
  const [tilt, setTilt] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem("twingo:tilt") === "1",
  );
  const tiltRef = useRef(tilt);
  tiltRef.current = tilt;
  const steerRef = useRef(0);
  const tiltNeutralRef = useRef<number | null>(null);
  /* tilt sensitivity, 1-10 (persisted): maps to the full-lock lean angle,
     ~42° at 1 down to ~15° at 10 — higher = sharper response */
  const [tiltSens, setTiltSens] = useState(() => {
    if (typeof window !== "undefined") {
      const n = Number(localStorage.getItem("twingo:tilt-sens"));
      if (n >= 1 && n <= 10) return Math.round(n);
    }
    return 5;
  });
  const tiltSensRef = useRef(tiltSens);
  tiltSensRef.current = tiltSens;
  /* cockpit sprites loaded — without them the toggle stays hidden */
  const [cockpitReady, setCockpitReady] =
    useState(
      false,
    ); /* fuel ran dry: engine froze, overlay shows the score + PLAY AGAIN */
  const [gameOver, setGameOver] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  /* elapsed engine time of the finished run — sent as the score's
     plausibility proof */
  const [finalTime, setFinalTime] = useState(0);
  /* leaderboard: top-10 list, initials form state, rank after submit */
  const [board, setBoard] = useState<ScoreEntry[] | null>(null);
  /* period tabs on the leaderboard: all-time vs rolling 30d/7d/24h
     windows — persisted so the panel reopens on the last-used tab */
  const [boardPeriod, setBoardPeriod] = useState<ScorePeriod>(() => {
    if (typeof window !== "undefined") {
      const p = localStorage.getItem("twingo:board-period");
      if (p === "daily" || p === "weekly" || p === "monthly" || p === "all")
        return p;
    }
    return "all";
  });
  const boardPeriodRef = useRef(boardPeriod);
  boardPeriodRef.current = boardPeriod;
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
  /* touch devices: canvas CSS size measured in JS from the visual viewport.
     Mobile viewport units proved unreliable across URL-bar states (a vh —
     and on some browsers even dvh — sized canvas ends up taller than the
     visible area and the centred layout clips the LCD cluster off the top).
     visualViewport always reflects the visible area, chrome excluded */
  const [canvasCss, setCanvasCss] = useState<{ w: number; h: number } | null>(
    null,
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RacerEngine | null>(null);
  /* record chase: each period's #1 score, fetched at run start — applied
     to the engine both when the fetch lands and when the engine boots,
     whichever happens last */
  const recordTargetsRef = useRef<{ score: number; label: string }[]>([]);
  const pausedRef = useRef(false);
  const gameOverRef = useRef(false);
  /* mirrors for the engine-loop key handler — it closes over the first
     render's callbacks, so pause state must reach it through refs */
  const pauseMenuRef = useRef(false);
  const pauseSelRef = useRef<
    "resume" | "stats" | "settings" | "restart" | "quit"
  >("resume");
  /* settings panel mirrors for the engine-loop key handler (same stale-
     closure reason as pauseMenuRef above) */
  const pauseSettingsOpenRef = useRef(false);
  const settingsRowRef = useRef(0);
  const showFpsRef = useRef(false);
  /* mirror of `coarse` for the engine-loop key handler (same stale-
     closure reason as pauseMenuRef above) */
  const coarseRef = useRef(false);
  coarseRef.current = coarse;
  pauseSettingsOpenRef.current = pauseSettingsOpen;
  settingsRowRef.current = settingsRow;
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
  pauseMenuRef.current = pauseMenu;
  pauseSelRef.current = pauseSel;
  showFpsRef.current = showFps;

  /* each run gets a fresh single-use submit token; PLAY AGAIN re-issues.
     On failure the leaderboard UI stays hidden and the game just plays.
     Gated on actually starting a run so idling on the title screen never
     burns a token. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: runId intentionally re-issues a token when PLAY AGAIN starts a new run
  useEffect(() => {
    if (!open || screen !== "playing") return;
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
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then((d: { token: string }) => {
        if (!cancelled) tokenRef.current = d.token;
      })
      .catch(() => {
        if (!cancelled) tokenRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [open, runId, screen]);

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
      // the submit response carries the all-time top-10 and the rank is
      // an all-time rank — pin the visible tab to ALL so they line up.
      // Bump the board generation so the game-over-time fetch (possibly
      // still in flight, possibly stale-cached) can't overwrite this
      boardGenRef.current++;
      setBoardPeriod("all");
      setBoard(d.scores);
      setSubmitState("done");
    } catch {
      setSubmitState("error");
    }
  }, [initials, submitState, finalScore, finalTime]);

  /* M key / speaker button: master mute, remembered across sessions */
  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      localStorage.setItem("twingo:muted", next ? "1" : "0");
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  /* settings panel sliders: bump one channel by a step (clamped 0-10),
     push it live into the audio buses and remember it across sessions */
  const adjustVol = useCallback((row: number, delta: number) => {
    const key = (["music", "engine", "menu"] as const)[row];
    if (!key) return;
    audioRef.current?.menuMove();
    setVols((v) => {
      const next = { ...v, [key]: Math.max(0, Math.min(10, v[key] + delta)) };
      try {
        localStorage.setItem("twingo:vol", JSON.stringify(next));
      } catch {}
      audioRef.current?.setVolumes(next);
      return next;
    });
  }, []);

  /* PLAY AGAIN: drop the engine and re-run the boot effect cleanly */
  const playAgain = useCallback(() => {
    audioRef.current?.menuSelect();
    audioRef.current?.setInterior(false);
    engineRef.current = null;
    gameOverRef.current = false;
    keysRef.current = { left: false, right: false, gas: false, brake: false };
    setGameOver(false);
    setPauseMenu(false);
    setPaused(false);
    setView("chase"); // every run starts on the chase cam
    setRunId((r) => r + 1);
  }, []);

  const close = useCallback(() => {
    audioRef.current?.stop();
    setOpen(false);
    setPaused(false);
    setPauseMenu(false);
    setPauseSettingsOpen(false);
    // reset to the title screen for the next session
    setScreen("title");
    setTitleSel("start");
    setTitleBoard(false);
    setTitleSettingsOpen(false);
    // return focus to whichever START button is visible
    const btn =
      document.getElementById("crt-start-btn") ??
      document.getElementById("ticker-start-btn");
    btn?.focus();
  }, []);

  /* ESC / ⏸ during a run: freeze the engine and open the pause menu */
  const openPauseMenu = useCallback(() => {
    keysRef.current = { left: false, right: false, gas: false, brake: false };
    audioRef.current?.menuSelect();
    setPaused(true);
    setPauseMenu(true);
    setPauseSel("resume");
    setPauseSettingsOpen(false);
  }, []);

  const resumeFromPause = useCallback(() => {
    audioRef.current?.menuSelect();
    setPauseMenu(false);
    setPaused(false);
  }, []);

  /* QUIT from the pause menu: drop the engine (so the next START boots a
     fresh run instead of resuming at speed) and land on the title screen */
  const quitToTitle = useCallback(() => {
    engineRef.current = null;
    gameOverRef.current = false;
    keysRef.current = { left: false, right: false, gas: false, brake: false };
    // silence the engine hum; the music keeps playing over the title art
    audioRef.current?.menuSelect();
    audioRef.current?.setInterior(false);
    audioRef.current?.drive(0, false, false, 0, 0, false, 0, false);
    setGameOver(false);
    setPauseMenu(false);
    setPauseSettingsOpen(false);
    setPaused(false);
    setScreen("title");
    setTitleSel("start");
    setTitleBoard(false);
    setTitleSettingsOpen(false);
  }, []);

  /* START on the title screen: boot the engine and drop into the READY
     flash. If the previous session ended mid-overlay (game over never
     replayed), reset the run first — same as PLAY AGAIN. Also kick off
     the record-chase fetch: the run's targets are each period's #1. */
  const startRun = useCallback(() => {
    setTitleBoard(false);
    if (gameOverRef.current) playAgain();
    setScreen("playing");
    setIntro(true);
    // ascending prestige: later entries win the dedupe when two period
    // tops sit on the same score (the same run holding 24H and 7D fires
    // one banner, the more prestigious one)
    const CHASE: [ScorePeriod, string][] = [
      ["daily", "24H"],
      ["weekly", "7D"],
      ["monthly", "30D"],
      ["all", "ALL-TIME"],
    ];
    void Promise.all(
      CHASE.map(([p]) =>
        fetch(`/api/highscore?period=${p}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    ).then((boards) => {
      const byScore = new Map<number, { score: number; label: string }>();
      boards.forEach((d: { scores?: ScoreEntry[] } | null, i) => {
        const top = d?.scores?.[0]?.score;
        if (typeof top === "number" && top > 0) {
          byScore.set(top, { score: top, label: CHASE[i][1] });
        }
      });
      const targets = [...byScore.values()].sort((a, b) => a.score - b.score);
      recordTargetsRef.current = targets;
      engineRef.current?.setRecordTargets(targets);
    });
  }, [playAgain]);

  /* leaderboard fetch for the visible period tab; the game-over overlay
     and the title panel share it. Generation guard: a slow fetch started
     at game-over time must not clobber the fresher board that a submit
     response just delivered (a stale-SW NetworkFirst reply can land
     seconds late — that once blanked a fresh #1 on the ALL tab) */
  const boardGenRef = useRef(0);
  const fetchBoard = useCallback((period: ScorePeriod) => {
    const gen = boardGenRef.current;
    setBoard(null);
    setBoardError(false);
    // no-store: the middleware once forced public caching on /api and the
    // browser happily replayed a minutes-old board over a fresh submit
    fetch(`/api/highscore?period=${period}`, { cache: "no-store" })
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then((d: { scores: ScoreEntry[] }) => {
        if (boardGenRef.current === gen) setBoard(d.scores);
      })
      .catch(() => {
        if (boardGenRef.current === gen) setBoardError(true);
      });
  }, []);

  const selectPeriod = useCallback(
    (p: ScorePeriod) => {
      setBoardPeriod(p);
      try {
        localStorage.setItem("twingo:board-period", p);
      } catch {}
      fetchBoard(p);
    },
    [fetchBoard],
  );

  /* LEADERBOARD on the title screen: read-only top-10 panel — no token
     needed to look, only to submit after a run */
  const openTitleBoard = useCallback(() => {
    setTitleBoard(true);
    fetchBoard(boardPeriod);
  }, [fetchBoard, boardPeriod]);

  /* V key / CAM button: flip between chase cam and cockpit */
  const toggleView = useCallback(() => {
    if (!cockpitReadyRef.current) return;
    setView((v) => {
      const next: RacerView = v === "chase" ? "cockpit" : "chase";
      if (engineRef.current) engineRef.current.state.view = next;
      // the cabin muffles the engine and the outside tire noise
      audioRef.current?.setInterior(next === "cockpit");
      return next;
    });
  }, []);

  /* TILT setting (touch devices): the phone becomes the steering wheel.
     iOS 13+ gates the sensor behind a per-gesture permission prompt, so
     the request has to happen right inside the toggle click */
  const toggleTilt = useCallback(() => {
    audioRef.current?.menuMove();
    setTilt((t) => {
      const next = !t;
      try {
        localStorage.setItem("twingo:tilt", next ? "1" : "0");
      } catch {}
      if (next) {
        tiltNeutralRef.current = null; // recalibrate on enable
        // the whole API vanishes on insecure (plain HTTP) origins — the
        // constructor itself is undefined there, so reach it defensively
        const doe = (
          globalThis as {
            DeviceOrientationEvent?: {
              requestPermission?: () => Promise<string>;
            };
          }
        ).DeviceOrientationEvent;
        doe?.requestPermission?.().catch(() => {});
      }
      return next;
    });
  }, []);

  /* tilt sensitivity slider (SETTINGS row, 1-10): step the full-lock
     angle by ±3° per notch */
  const adjustTiltSens = useCallback((delta: number) => {
    audioRef.current?.menuMove();
    setTiltSens((s) => {
      const next = Math.max(1, Math.min(10, s + delta));
      try {
        localStorage.setItem("twingo:tilt-sens", String(next));
      } catch {}
      return next;
    });
  }, []);

  /* tilt stream: the first sample after enabling is the neutral pose;
     past a 5° deadzone, lean up to the full-lock angle (sensitivity) =
     full lock. Portrait steers on gamma, landscape on beta (the axes
     swap when the phone turns), with the sign flipped on the 270° side
     so "lean right" always steers right. Output is smoothed and written
     to steerRef; the game loop injects it into the input bag each frame */
  useEffect(() => {
    if (!open || !tilt) return;
    const onOrient = (ev: DeviceOrientationEvent) => {
      const angle =
        (window.screen.orientation?.angle ??
          (window as unknown as { orientation?: number }).orientation ??
          0) % 360;
      const raw =
        angle === 0 || angle === 180
          ? (ev.gamma ?? 0)
          : angle === 90
            ? (ev.beta ?? 0)
            : -(ev.beta ?? 0);
      if (tiltNeutralRef.current === null) tiltNeutralRef.current = raw;
      const rel = raw - tiltNeutralRef.current;
      const fullLock = 45 - tiltSensRef.current * 3;
      const mag = Math.max(0, Math.abs(rel) - 5) / (fullLock - 5);
      const target = Math.sign(rel) * Math.min(1, mag);
      steerRef.current += (target - steerRef.current) * 0.25;
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      steerRef.current = 0;
    };
  }, [open, tilt]);

  /* the START buttons dispatch this event — the overlay opens on the
     title screen, the engine boots only when START is pressed there.
     The click is a user gesture, so the audio context is born here */
  useEffect(() => {
    const onStart = () => {
      if (!audioRef.current) {
        audioRef.current = createRacerAudio();
        audioRef.current.setMuted(mutedRef.current);
        audioRef.current.setVolumes(volsRef.current);
      }
      audioRef.current.start();
      setBuf(computeBuf());
      setOpen(true);
      setScreen("title");
      setTitleSel("start");
      setTitleBoard(false);
      setTitleSettingsOpen(false);
      setCoarse(window.matchMedia("(pointer: coarse)").matches);
    };
    window.addEventListener("twingo:start", onStart);
    return () => window.removeEventListener("twingo:start", onStart);
  }, []);

  /* lock page scroll and grab focus while the overlay is open (title
     screen included, not just the running game) */
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    overlayRef.current?.focus();
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /* title screen keyboard control: ↑/↓ (or W/S) arm a button, Enter or
     Space activates it ("PRESS ENTER TO SELECT"), Escape closes the
     settings/leaderboard panel first, then the overlay. While SETTINGS is
     open, ↑/↓ picks a channel and ←/→ sets its level */
  useEffect(() => {
    if (!open || screen !== "title") return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        if (titleSettingsOpen) setTitleSettingsOpen(false);
        else if (titleBoard) setTitleBoard(false);
        else close();
        return;
      }
      if (titleBoard) return;
      const k = ev.key.toLowerCase();
      if (titleSettingsOpen) {
        // touch devices get two extra rows: TILT on/off + SENS slider
        const rows = coarse ? 5 : 3;
        if (k === "arrowup" || k === "w") {
          ev.preventDefault();
          audioRef.current?.menuMove();
          setSettingsRow((r) => (r + rows - 1) % rows);
        } else if (k === "arrowdown" || k === "s") {
          ev.preventDefault();
          audioRef.current?.menuMove();
          setSettingsRow((r) => (r + 1) % rows);
        } else if (k === "arrowleft" || k === "a") {
          ev.preventDefault();
          if (settingsRow === 3) toggleTilt();
          else if (settingsRow === 4) adjustTiltSens(-1);
          else adjustVol(settingsRow, -1);
        } else if (k === "arrowright" || k === "d") {
          ev.preventDefault();
          if (settingsRow === 3) toggleTilt();
          else if (settingsRow === 4) adjustTiltSens(1);
          else adjustVol(settingsRow, 1);
        } else if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          audioRef.current?.menuSelect();
          setTitleSettingsOpen(false);
        }
        return;
      }
      if (k === "m") {
        toggleMute();
        return;
      }
      if (k === "arrowup" || k === "arrowdown" || k === "w" || k === "s") {
        ev.preventDefault();
        audioRef.current?.menuMove();
        const order = ["start", "board", "settings"] as const;
        setTitleSel((s) => {
          const i = order.indexOf(s);
          const step = k === "arrowup" || k === "w" ? order.length - 1 : 1;
          return order[(i + step) % order.length];
        });
        return;
      }
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        audioRef.current?.menuSelect();
        if (titleSel === "start") startRun();
        else if (titleSel === "board") openTitleBoard();
        else {
          setSettingsRow(0);
          setTitleSettingsOpen(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    open,
    screen,
    titleBoard,
    titleSel,
    titleSettingsOpen,
    settingsRow,
    coarse,
    close,
    startRun,
    openTitleBoard,
    toggleMute,
    adjustVol,
    toggleTilt,
    adjustTiltSens,
  ]);

  /* rotating the phone mid-run flips the buffer between the landscape and
     portrait shapes; the engine keeps its state and just re-fits (resize) */
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(orientation: landscape)");
    const onFlip = () => setBuf(computeBuf());
    mq.addEventListener("change", onFlip);
    return () => mq.removeEventListener("change", onFlip);
  }, [open]);

  /* touch devices: fit the canvas into the REALLY visible box, measured in
     JS (see canvasCss above). Re-runs on orientation flips (buf changes)
     and on URL-bar show/hide (visualViewport resize). Desktop keeps the
     pure-CSS min() sizing — no viewport-unit quirks there */
  useEffect(() => {
    if (!open || !coarse) {
      setCanvasCss(null);
      return;
    }
    const fit = () => {
      const vv = window.visualViewport;
      const availW = vv?.width ?? window.innerWidth;
      const availH = vv?.height ?? window.innerHeight;
      const a = buf.w / buf.h;
      let w = availW;
      let h = w / a;
      if (h > availH) {
        h = availH;
        w = h * a;
      }
      setCanvasCss({ w: Math.floor(w), h: Math.floor(h) });
    };
    fit();
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
    };
  }, [open, coarse, buf]);

  /* TODAY'S TRACK difficulty card: rate the daily layout once per
     session, deferred a beat so the title art paints first */
  useEffect(() => {
    if (!open || screen !== "title" || trackStats) return;
    const id = window.setTimeout(() => {
      setTrackStats(analyzeTrack(turkeyDay(), 3000));
    }, 60);
    return () => window.clearTimeout(id);
  }, [open, screen, trackStats]);

  /* small countdown under the track card: time to the next daily reset
     (midnight TR time). A rollover while the title sits open re-rates
     the fresh day */
  const [resetIn, setResetIn] = useState("");
  useEffect(() => {
    if (!open || screen !== "title") return;
    let day = turkeyDay();
    const tick = () => {
      setResetIn(resetCountdown());
      const d = turkeyDay();
      if (d !== day) {
        day = d;
        setTrackStats(null);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [open, screen]);

  /* engine boot + game loop, alive only while a run is on screen — the
     title screen is a static image and never boots the engine */
  // biome-ignore lint/correctness/useExhaustiveDependencies: runId intentionally re-boots the engine when PLAY AGAIN is pressed
  useEffect(() => {
    if (!open || screen !== "playing") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const introTimer = window.setTimeout(() => setIntro(false), 1200);

    let cancelled = false;
    let raf = 0;
    let last = performance.now();
    let fpsFrames = 0;
    let fpsLast = performance.now();
    // dev-only: after a wake (tab switch / lock), capture the next ~5 s of
    // raw frame intervals and log a summary — tab-return jank diagnosis
    let resumeCap: number[] | null = null;

    const frame = (now: number) => {
      const rawGap = now - last;
      const dt = Math.min(rawGap / 1000, 1 / 30);
      last = now;
      if (rawGap > 250) {
        // the tab slept: the FPS window must not average the freeze in,
        // or the overlay shows a bogus single-digit FPS after every wake
        fpsFrames = 0;
        fpsLast = now;
        if (process.env.NODE_ENV !== "production") resumeCap = [];
      } else if (resumeCap) {
        resumeCap.push(rawGap);
        if (resumeCap.length >= 300) {
          const sorted = [...resumeCap].sort((a, b) => a - b);
          const avg = resumeCap.reduce((s, v) => s + v, 0) / resumeCap.length;
          console.info(
            `[racer] post-wake frames: avg ${avg.toFixed(1)}ms ` +
              `p95 ${sorted[Math.floor(sorted.length * 0.95)].toFixed(1)}ms ` +
              `max ${sorted[sorted.length - 1].toFixed(1)}ms`,
          );
          resumeCap = null;
        }
      }
      // FPS overlay: average over 0.5 s windows, only setState when shown
      fpsFrames++;
      if (now - fpsLast >= 500) {
        if (showFpsRef.current)
          setFps(Math.round((fpsFrames * 1000) / (now - fpsLast)));
        fpsFrames = 0;
        fpsLast = now;
      }
      const e = engineRef.current;
      if (e && !pausedRef.current) {
        // tilt steering: inject the smoothed analog value; it overrides
        // the digital left/right flags inside the engine
        if (tiltRef.current) keysRef.current.steer = steerRef.current;
        else delete keysRef.current.steer;
        e.update(dt, keysRef.current);
        e.render(ctx);
        // after the tank ran dry the engine stays silent — gameOver()
        // already faded it out; drive() would revive an idle drone
        if (!gameOverRef.current) {
          audioRef.current?.setPaused(false);
          audioRef.current?.drive(
            e.state.speed / ENGINE_CONSTANTS.MAX_SPEED,
            keysRef.current.gas,
            keysRef.current.brake,
            e.state.skid,
            e.state.rpm01,
            e.state.shiftT > 0,
            e.state.score,
            e.state.boostT > 0,
          );
        }
        if (e.state.gameOver && !gameOverRef.current) {
          gameOverRef.current = true;
          audioRef.current?.gameOver();
          setFinalScore(Math.floor(e.state.score));
          setFinalTime(e.state.time);
          setGameOver(true);
          // fetch the current period's top-10 alongside the overlay
          fetchBoard(boardPeriodRef.current);
        }
      } else if (pausedRef.current) {
        // frozen run: silence the car, leave the music playing
        audioRef.current?.setPaused(true);
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
        // daily seed: everyone races the same layout on the same Turkey-
        // time day (midnight TR, UTC+3), so same-day highscores are
        // comparable — a fresh track every day.
        // The seeded generator deals sections forever under its geometric
        // limits (alternating curve sides, sea-level-sprung hills)
        const { segments, extend, firstIndex, generated } =
          createTrackGenerator(turkeyDay());
        // the difficulty card is normally rated while the title sits open;
        // an impatient START within that beat re-rates here synchronously
        // (same seed, same result) so scarcity never falls back blind
        const stats = trackStats ?? analyzeTrack(turkeyDay(), 3000);
        engineRef.current = createEngine({
          segments,
          extend,
          firstIndex,
          generated,
          roadside: makeRoadside(),
          car,
          gasCan,
          gasCanGolden: tintGold(gasCan),
          cockpit,
          view: "chase",
          width: buf.w,
          height: buf.h,
          mapDifficulty: stats ? trackDifficulty(stats) : undefined,
          clusterTopLeft: window.matchMedia("(pointer: coarse)").matches,
          reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches,
          onPickup: (big, golden) => audioRef.current?.pickup(big, golden),
          onStreak: (tier) => audioRef.current?.streak(tier),
          onCrash: () => audioRef.current?.crash(),
          onBreakdown: () => audioRef.current?.breakdown(),
          onBracket: () => audioRef.current?.bracket(),
          debug: process.env.NODE_ENV !== "production",
        });
        setView(engineRef.current.state.view);
        // a record-chase fetch that landed before the engine booted
        if (recordTargetsRef.current.length > 0) {
          engineRef.current.setRecordTargets(recordTargetsRef.current);
        }
        // dev-only handle for e2e probes (speed, gear, …)
        if (process.env.NODE_ENV !== "production") {
          (window as unknown as { __twingo?: RacerEngine }).__twingo =
            engineRef.current;
        }
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
      const map: Record<string, "left" | "right" | "gas" | "brake"> = {
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
        // ESC peels one layer at a time: settings panel → pause menu →
        // (during a run) open the pause menu — never on top of the
        // game-over overlay (its own buttons rule there)
        if (pauseSettingsOpenRef.current) setPauseSettingsOpen(false);
        else if (pauseMenuRef.current) resumeFromPause();
        else if (!gameOverRef.current) openPauseMenu();
        return;
      }
      // pause menu keyboard control: ↑/↓ arm an option, Enter/Space runs it
      if (pauseMenuRef.current) {
        if (!down) return;
        const sel = pauseSelRef.current;
        if (pauseSettingsOpenRef.current) {
          // settings panel owns the keys while open: ↑/↓ picks a row,
          // ←/→ adjusts it (volume step, TILT on/off, SENS slider on
          // touch), Enter closes back to the menu
          const rows = coarseRef.current ? 5 : 3;
          if (k === "arrowup" || k === "w") {
            ev.preventDefault();
            audioRef.current?.menuMove();
            setSettingsRow((r) => (r + rows - 1) % rows);
          } else if (k === "arrowdown" || k === "s") {
            ev.preventDefault();
            audioRef.current?.menuMove();
            setSettingsRow((r) => (r + 1) % rows);
          } else if (k === "arrowleft" || k === "a") {
            ev.preventDefault();
            if (settingsRowRef.current === 3) toggleTilt();
            else if (settingsRowRef.current === 4) adjustTiltSens(-1);
            else adjustVol(settingsRowRef.current, -1);
          } else if (k === "arrowright" || k === "d") {
            ev.preventDefault();
            if (settingsRowRef.current === 3) toggleTilt();
            else if (settingsRowRef.current === 4) adjustTiltSens(1);
            else adjustVol(settingsRowRef.current, 1);
          } else if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            audioRef.current?.menuSelect();
            setPauseSettingsOpen(false);
          }
          return;
        }
        if (k === "m") {
          toggleMute();
          return;
        }
        if (k === "arrowup" || k === "arrowdown" || k === "w" || k === "s") {
          ev.preventDefault();
          const order = [
            "resume",
            "stats",
            "settings",
            "restart",
            "quit",
          ] as const;
          const i = order.indexOf(sel);
          const next =
            k === "arrowup" || k === "w"
              ? order[(i + order.length - 1) % order.length]
              : order[(i + 1) % order.length];
          audioRef.current?.menuMove();
          setPauseSel(next);
          return;
        }
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          if (sel === "resume") resumeFromPause();
          else if (sel === "stats") {
            audioRef.current?.menuSelect();
            setPauseStats((s) => !s);
          } else if (sel === "settings") {
            audioRef.current?.menuSelect();
            setSettingsRow(0);
            setPauseSettingsOpen(true);
          } else if (sel === "restart") playAgain();
          else quitToTitle();
        }
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
      // F toggles the FPS counter overlay
      if (down && (k === "f" || ev.code === "KeyF")) {
        setShowFps((s) => !s);
        return;
      }
      // M toggles all game audio (music + engine + effects)
      if (down && (k === "m" || ev.code === "KeyM")) {
        toggleMute();
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
    // throttle stuck on (or silently off) when the tab returns. A hidden
    // tab also suspends the whole AudioContext: the pause menu only
    // silences the car by design, but a locked phone must go FULLY quiet
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
      audioRef.current?.setHidden(document.hidden);
    };
    document.addEventListener("visibilitychange", autoPause);
    window.addEventListener("blur", autoPause);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(introTimer);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      document.removeEventListener("visibilitychange", autoPause);
      window.removeEventListener("blur", autoPause);
      // release any held keys so the car doesn't drive off on its own
      keysRef.current = { left: false, right: false, gas: false, brake: false };
    };
  }, [
    open,
    screen,
    close,
    buf.w,
    buf.h,
    runId,
    toggleMute,
    adjustVol,
    toggleTilt,
    adjustTiltSens,
    fetchBoard,
  ]);

  const bindTouch = (key: "left" | "right" | "gas" | "brake") => ({
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

  /* sound settings panel — shared by the title screen and the pause menu.
     Three volume channels (ten steps each) plus a touch-only TILT row;
     ◀ ▶ buttons keep it playable on touch */
  const settingsPanel = (onBack: () => void) => (
    <div
      className="racer-settings font-pixel"
      role="dialog"
      aria-label="Sound settings"
    >
      <div className="racer-settings-title">SETTINGS</div>
      {(["music", "engine", "menu"] as const).map((ch, i) => (
        // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard control lives on the overlay's window-level handler
        <div
          key={ch}
          className={`racer-settings-row${
            settingsRow === i ? " racer-settings-row-sel" : ""
          }`}
          onClick={() => setSettingsRow(i)}
        >
          <button
            type="button"
            className="racer-settings-step font-pixel"
            aria-label={`${ch} volume down`}
            onClick={(e) => {
              e.stopPropagation();
              setSettingsRow(i);
              adjustVol(i, -1);
            }}
          >
            ◀
          </button>
          <span className="racer-settings-label">{ch.toUpperCase()}</span>
          <span className="racer-settings-bar" aria-hidden="true">
            {Array.from({ length: 10 }, (_, s) => (
              <span
                key={s}
                className={`racer-settings-seg${
                  s < vols[ch] ? " racer-settings-seg-on" : ""
                }`}
              />
            ))}
          </span>
          <button
            type="button"
            className="racer-settings-step font-pixel"
            aria-label={`${ch} volume up`}
            onClick={(e) => {
              e.stopPropagation();
              setSettingsRow(i);
              adjustVol(i, 1);
            }}
          >
            ▶
          </button>
        </div>
      ))}
      {/* touch-only 4th row: TILT steering on/off — the phone becomes
          the wheel, so the ◀ ▶ pads can be dropped while it's on */}
      {coarse && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard control lives on the overlay's window-level handler
        <div
          className={`racer-settings-row${
            settingsRow === 3 ? " racer-settings-row-sel" : ""
          }`}
          onClick={() => setSettingsRow(3)}
        >
          <button
            type="button"
            className="racer-settings-step font-pixel"
            aria-label="Toggle tilt steering"
            onClick={(e) => {
              e.stopPropagation();
              setSettingsRow(3);
              toggleTilt();
            }}
          >
            ◀
          </button>
          <span className="racer-settings-label">TILT</span>
          <span className="racer-settings-bar" aria-hidden="true">
            <span className="racer-settings-tilt">{tilt ? "ON" : "OFF"}</span>
          </span>
          <button
            type="button"
            className="racer-settings-step font-pixel"
            aria-label="Toggle tilt steering"
            onClick={(e) => {
              e.stopPropagation();
              setSettingsRow(3);
              toggleTilt();
            }}
          >
            ▶
          </button>
        </div>
      )}
      {/* touch-only 5th row: tilt sensitivity — how far the phone must
          lean for full lock */}
      {coarse && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard control lives on the overlay's window-level handler
        <div
          className={`racer-settings-row${
            settingsRow === 4 ? " racer-settings-row-sel" : ""
          }`}
          onClick={() => setSettingsRow(4)}
        >
          <button
            type="button"
            className="racer-settings-step font-pixel"
            aria-label="Tilt sensitivity down"
            onClick={(e) => {
              e.stopPropagation();
              setSettingsRow(4);
              adjustTiltSens(-1);
            }}
          >
            ◀
          </button>
          <span className="racer-settings-label">SENS</span>
          <span className="racer-settings-bar" aria-hidden="true">
            {Array.from({ length: 10 }, (_, s) => (
              <span
                key={s}
                className={`racer-settings-seg${
                  s < tiltSens ? " racer-settings-seg-on" : ""
                }`}
              />
            ))}
          </span>
          <button
            type="button"
            className="racer-settings-step font-pixel"
            aria-label="Tilt sensitivity up"
            onClick={(e) => {
              e.stopPropagation();
              setSettingsRow(4);
              adjustTiltSens(1);
            }}
          >
            ▶
          </button>
        </div>
      )}
      <button
        type="button"
        className="racer-playagain font-pixel"
        onClick={() => {
          audioRef.current?.menuSelect();
          onBack();
        }}
      >
        BACK
      </button>
      <div className="racer-pausemenu-hint">↑↓ ROW ◀▶ ADJUST</div>
    </div>
  );

  /* period tabs shared by the title leaderboard panel and the game-over
     overlay: all-time plus rolling 30d / 7d / 24h windows */
  const boardTabs = (
    <div className="racer-lb-tabs" role="tablist" aria-label="Score period">
      {(
        [
          ["all", "ALL"],
          ["monthly", "30D"],
          ["weekly", "7D"],
          ["daily", "24H"],
        ] as const
      ).map(([p, label]) => (
        <button
          key={p}
          type="button"
          role="tab"
          aria-selected={boardPeriod === p}
          className={`racer-lb-tab font-pixel${
            boardPeriod === p ? " racer-lb-tab-sel" : ""
          }`}
          onClick={() => selectPeriod(p)}
        >
          {label}
        </button>
      ))}
    </div>
  );

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
      onClick={() => paused && !pauseMenu && setPaused(false)}
      onKeyDown={() => paused && !pauseMenu && setPaused(false)}
    >
      {screen === "title" ? (
        <div className="racer-title">
          {/* blurred cover copy of the art fills the letterbox bands;
              display:contents keeps the picture wrapper out of layout */}
          <picture>
            <source
              media="(min-aspect-ratio: 1/1)"
              srcSet="/images/twingo-title-desktop.webp"
            />
            <img
              className="racer-title-bg"
              src="/images/twingo-title-mobile.webp"
              alt=""
            />
          </picture>
          {/* aspect-locked box: the hit areas below stay glued to the
              painted buttons at any viewport size */}
          <div className="racer-title-art">
            <picture>
              <source
                media="(min-aspect-ratio: 1/1)"
                srcSet="/images/twingo-title-desktop.webp"
              />
              <img
                className="racer-title-img"
                src="/images/twingo-title-mobile.webp"
                alt="2026 Twingo Racer — title screen"
              />
            </picture>
            <button
              type="button"
              className={`racer-title-btn racer-title-btn-start${
                titleSel === "start" ? " racer-title-btn-sel" : ""
              }`}
              aria-label="Start race"
              onClick={startRun}
              onPointerEnter={() => setTitleSel("start")}
              ref={(el) => {
                if (titleSel === "start" && !titleBoard) el?.focus();
              }}
            />
            <button
              type="button"
              className={`racer-title-btn racer-title-btn-board${
                titleSel === "board" ? " racer-title-btn-sel" : ""
              }`}
              aria-label="Show leaderboard"
              onClick={openTitleBoard}
              onPointerEnter={() => setTitleSel("board")}
              ref={(el) => {
                if (titleSel === "board" && !titleBoard) el?.focus();
              }}
            />
          </div>
          {/* sound settings chip — the artwork's painted buttons can't
              grow a third one, so this lives as a small DOM chip under it */}
          <button
            type="button"
            className={`racer-title-settings font-pixel${
              titleSel === "settings" ? " racer-title-settings-sel" : ""
            }`}
            onClick={() => {
              audioRef.current?.menuSelect();
              setSettingsRow(0);
              setTitleSettingsOpen(true);
            }}
            onPointerEnter={() => setTitleSel("settings")}
            ref={(el) => {
              if (titleSel === "settings" && !titleBoard && !titleSettingsOpen)
                el?.focus();
            }}
          >
            SETTINGS
          </button>
          {/* TODAY'S TRACK: 1-5 star difficulty card of the first 3 km of
              today's seeded layout — a slim bottom strip, hidden while a
              title panel is open. Stars are pixel squares: Press Start 2P
              has no ★ glyph */}
          {trackStats && !titleBoard && !titleSettingsOpen && (
            <div className="racer-trackstats font-pixel">
              <span className="racer-trackstats-cap">TODAY&apos;S TRACK</span>
              {(
                [
                  ["CURVES", trackStats.curves],
                  ["HILLS", trackStats.hills],
                  ["FUEL", trackStats.fuel],
                ] as [string, number][]
              ).map(([label, n]) => (
                <span className="racer-trackstats-row" key={label}>
                  {label}
                  <span className="racer-trackstats-stars" aria-hidden="true">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <span
                        key={i}
                        className={`racer-star${i <= n ? " racer-star-on" : ""}`}
                      />
                    ))}
                  </span>
                  <span className="sr-only">{n} of 5</span>
                </span>
              ))}
              <span className="racer-trackstats-verdict">
                {trackStats.verdict}
              </span>
              <span className="racer-trackstats-reset">RESET {resetIn}</span>
            </div>
          )}
          {titleSettingsOpen &&
            settingsPanel(() => setTitleSettingsOpen(false))}
          {titleBoard && (
            <div
              className="racer-gameover racer-title-panel font-pixel"
              role="dialog"
              aria-label="Leaderboard"
            >
              <div className="racer-gameover-title">LEADERBOARD</div>
              {boardTabs}
              {board && board.length > 0 && (
                <ol className="racer-leaderboard">
                  {board.map((s, i) => (
                    <li key={`${s.name}-${s.at}-${i}`}>
                      <span className="racer-lb-name">
                        {String(i + 1).padStart(2, "0")}. {s.name}
                      </span>
                      <BracketGem score={s.score} />
                      <span className="racer-lb-score">{s.score}</span>
                    </li>
                  ))}
                </ol>
              )}
              {board && board.length === 0 && (
                <div className="racer-gameover-score">NO SCORES YET</div>
              )}
              {boardError && (
                <div className="racer-initials-error">
                  LEADERBOARD UNAVAILABLE
                </div>
              )}
              {!board && !boardError && (
                <div className="racer-gameover-score">LOADING...</div>
              )}
              <button
                type="button"
                className="racer-playagain font-pixel"
                onClick={() => setTitleBoard(false)}
                ref={(el) => el?.focus()}
              >
                BACK
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="racer-crt">
          <div className="racer-screen">
            <canvas
              ref={canvasRef}
              width={buf.w}
              height={buf.h}
              className="racer-canvas"
              style={
                // touch: exact pixel fit measured off the visual viewport
                // (canvasCss) — viewport units clipped the cluster on some
                // phones. Desktop: pure CSS, dvh not vh (mobile 100vh is the
                // URL-bar-hidden height and would clip the centred canvas)
                canvasCss
                  ? { width: canvasCss.w, height: canvasCss.h }
                  : {
                      width: `min(calc(100vw - var(--racer-bezel-x)), calc((100dvh - var(--racer-bezel-y)) * ${buf.w / buf.h}))`,
                    }
              }
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
      )}

      {/* no DOM HUD — speed and score live on the in-canvas LCD cluster */}

      {intro && (
        <div className="racer-ready font-pixel" aria-hidden="true">
          READY...
        </div>
      )}
      {paused && !pauseMenu && (
        <div className="racer-paused font-pixel" role="status">
          PAUSED — CLICK TO RESUME
        </div>
      )}
      {pauseMenu && screen === "playing" && (
        <div
          className="racer-pausemenu font-pixel"
          role="menu"
          aria-label="Pause menu"
        >
          <div className="racer-pausemenu-title">PAUSED</div>
          <button
            type="button"
            role="menuitem"
            className={`racer-pausemenu-btn${
              pauseSel === "resume" ? " racer-pausemenu-btn-sel" : ""
            }`}
            onClick={resumeFromPause}
            onPointerEnter={() => {
              audioRef.current?.menuMove();
              setPauseSel("resume");
            }}
          >
            RESUME
          </button>
          <button
            type="button"
            role="menuitem"
            className={`racer-pausemenu-btn${
              pauseSel === "stats" ? " racer-pausemenu-btn-sel" : ""
            }`}
            onClick={() => {
              audioRef.current?.menuSelect();
              setPauseStats((s) => !s);
            }}
            onPointerEnter={() => {
              audioRef.current?.menuMove();
              setPauseSel("stats");
            }}
          >
            STATS
          </button>
          <button
            type="button"
            role="menuitem"
            className={`racer-pausemenu-btn${
              pauseSel === "settings" ? " racer-pausemenu-btn-sel" : ""
            }`}
            onClick={() => {
              audioRef.current?.menuSelect();
              setSettingsRow(0);
              setPauseSettingsOpen(true);
            }}
            onPointerEnter={() => {
              audioRef.current?.menuMove();
              setPauseSel("settings");
            }}
          >
            SETTINGS
          </button>
          <button
            type="button"
            role="menuitem"
            className={`racer-pausemenu-btn${
              pauseSel === "restart" ? " racer-pausemenu-btn-sel" : ""
            }`}
            onClick={playAgain}
            onPointerEnter={() => {
              audioRef.current?.menuMove();
              setPauseSel("restart");
            }}
          >
            RESTART
          </button>
          <button
            type="button"
            role="menuitem"
            className={`racer-pausemenu-btn${
              pauseSel === "quit" ? " racer-pausemenu-btn-sel" : ""
            }`}
            onClick={quitToTitle}
            onPointerEnter={() => {
              audioRef.current?.menuMove();
              setPauseSel("quit");
            }}
          >
            QUIT
          </button>
          {pauseStats && engineRef.current && (
            <div className="racer-pausemenu-stats">
              <div>SCORE {Math.floor(engineRef.current.state.score)}</div>
              <div>DIST {engineRef.current.state.distanceKm.toFixed(2)} KM</div>
              <div>
                TIME {Math.floor(engineRef.current.state.time / 60)}:
                {String(Math.floor(engineRef.current.state.time % 60)).padStart(
                  2,
                  "0",
                )}
              </div>
              <div>
                AVG{" "}
                {engineRef.current.state.time > 0.5
                  ? Math.round(
                      engineRef.current.state.distanceKm /
                        (engineRef.current.state.time / 3600),
                    )
                  : 0}{" "}
                KM/H
              </div>
            </div>
          )}
          {pauseSettingsOpen &&
            settingsPanel(() => setPauseSettingsOpen(false))}
          {!coarse && <div className="racer-pausemenu-hint">ESC — RESUME</div>}
        </div>
      )}
      {gameOver && screen === "playing" && (
        <div className="racer-gameover font-pixel" role="alert">
          <div className="racer-gameover-title">GAME OVER</div>
          <div className="racer-gameover-score">SCORE {finalScore}</div>

          {/* LoL-style bracket badge, derived from the score */}
          {(() => {
            const b = bracketForScore(finalScore);
            const next = nextBracket(finalScore);
            return (
              <>
                <div className="racer-bracket" style={{ color: b.color }}>
                  {b.name}
                </div>
                {next && (
                  <div className="racer-bracket-next">
                    NEXT: {next.name} —{" "}
                    {(next.min - finalScore).toLocaleString("en-US")} TO GO
                  </div>
                )}
              </>
            );
          })()}

          {myRank !== null && (
            <div className="racer-leaderboard-rank">RANK #{myRank}</div>
          )}

          {boardTabs}

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
                  <BracketGem score={s.score} />
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

          <div className="racer-gameover-actions">
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
            <button
              type="button"
              className="racer-quit font-pixel"
              onClick={quitToTitle}
            >
              QUIT
            </button>
          </div>
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

      {/* FPS counter — toggled with F */}
      {screen === "playing" && showFps && (
        <div className="racer-fps font-pixel" aria-hidden="true">
          {fps} FPS
        </div>
      )}

      {/* key legend — desktop only, hidden once the run is over */}
      {screen === "playing" && !coarse && !gameOver && (
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
            <span className="racer-key">F</span> FPS
          </div>
          <div className="racer-keys-row">
            <span className="racer-key">M</span> SOUND
          </div>
          <div className="racer-keys-row">
            <span className="racer-key">ESC</span> MENU
          </div>
        </div>
      )}

      {screen === "playing" && coarse && !gameOver && (
        <button
          type="button"
          className="racer-pause-touch font-pixel"
          onClick={openPauseMenu}
          aria-label="Pause game"
        >
          ❚❚
        </button>
      )}

      {/* touch mute: docks left of the pause button, mirrors its style —
          a note glyph with a strike when muted */}
      {screen === "playing" && coarse && (
        <button
          type="button"
          className={`racer-mute-touch font-pixel${muted ? " racer-mute-touch-off" : ""}`}
          onClick={toggleMute}
          aria-label={muted ? "Unmute game audio" : "Mute game audio"}
        >
          ♪
        </button>
      )}

      {/* touch camera toggle: docks left of the mute button with the same
          chrome — it used to sit between the bottom touch pads, right on
          top of the car on phones */}
      {screen === "playing" && coarse && !gameOver && cockpitReady && (
        <button
          type="button"
          className={`racer-cam-touch font-pixel${view === "cockpit" ? " racer-cam-on" : ""}`}
          onClick={toggleView}
          aria-label="Toggle camera view"
        >
          CAM
        </button>
      )}

      {screen === "playing" && coarse && (
        <div className="racer-touch" aria-hidden="true">
          {/* two-thumb corners: with TILT the phone is the wheel, so the
              pads become brake (left thumb) and gas (right thumb) at the
              far corners — a single remaining group would collapse to
              the left under space-between and both pedals would end up
              under one thumb. Without TILT: steer left, pedals right */}
          {tilt ? (
            <div className="racer-touch-group">
              <button
                type="button"
                className="racer-touch-btn font-pixel"
                {...bindTouch("brake")}
              >
                ▼
              </button>
            </div>
          ) : (
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
          )}
          {tilt ? (
            <div className="racer-touch-group">
              <button
                type="button"
                className="racer-touch-btn font-pixel"
                {...bindTouch("gas")}
              >
                ▲
              </button>
            </div>
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
}
