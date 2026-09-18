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
 *
 * VS RACE: a DOM chip on the title screen opens the P2P lobby (Trystero,
 * see ./racer/net.ts) — CREATE/JOIN a 4-char room code, READY up, the
 * lobby leader (oldest joinedAt) rolls a fresh random track seed and
 * starts the race: everyone's engine boots IMMEDIATELY (cars idling on
 * the grid, driving input suppressed) and a 3·2·1·GO counts down over
 * the canvas, receipt-relative — no shared clock needed. A shared link
 * (/<lang>/?race=CODE) auto-opens the overlay straight into the room.
 */

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScoreEntry, ScorePeriod } from "@/lib/highscore";
import {
  createRacerAudio,
  type RacerAudio,
  type RacerVolumes,
} from "./racer/audio";
import { type Bot, botStates, createBots, updateBots } from "./racer/bots";
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
import { type PadAction, type PadState, pollPad } from "./racer/gamepad";
import {
  MAX_RACERS,
  type NetCarState,
  type RaceBot,
  type RaceHello,
  type RaceNet,
  type RacePeer,
  START_COUNTDOWN_MS,
  TrysteroNet,
} from "./racer/net";
import {
  loadCarFrames,
  loadCat,
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

/* arcade initials spinner alphabet — same charset the text input enforces */
const SPIN_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/* VS RACE lobby: 4-char room codes without look-alike glyphs (no I/O/0/1) */
const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_FILTER = new RegExp(`[^${ROOM_CHARS}]`, "g");
const VALID_ROOM = new RegExp(`^[${ROOM_CHARS}]{4}$`);
const makeRoomCode = () =>
  Array.from(
    { length: 4 },
    () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)],
  ).join("");

/* lobby sub-views: home (CREATE/JOIN choice) → join (code input) → room
   (peer roster); "full" is the bounce screen for a 6th arrival */
type LobbyView = "home" | "join" | "room" | "full";

/* VS race start grid: lateral slot (road half-widths) + along-track slot
   (world units, negative = behind the start line) per roster index —
   the roster is sorted by joinedAt, index 0 is the lobby leader. The 5th
   arrival takes a back row: dead centre, 3 segments (600 world units)
   behind the start line */
interface GridSlot {
  x: number;
  pos: number;
}
const RACE_GRID: readonly (readonly GridSlot[])[] = [
  [{ x: 0, pos: 0 }],
  [
    { x: -0.45, pos: 0 },
    { x: 0.45, pos: 0 },
  ],
  [
    { x: -0.7, pos: 0 },
    { x: 0, pos: 0 },
    { x: 0.7, pos: 0 },
  ],
  [
    { x: -0.75, pos: 0 },
    { x: -0.25, pos: 0 },
    { x: 0.25, pos: 0 },
    { x: 0.75, pos: 0 },
  ],
  [
    { x: -0.75, pos: 0 },
    { x: -0.25, pos: 0 },
    { x: 0.25, pos: 0 },
    { x: 0.75, pos: 0 },
    { x: 0, pos: -600 },
  ],
];

/* per-race VS track seed: the lobby leader rolls a fresh one for every
   race (rematch included) — the daily track is solo-only */
const newSeed = () => Math.floor(Math.random() * 1e9);

/* input bag fed to the engine while a VS race countdown holds the grid:
   every channel zeroed, the analog ones included — the car idles in
   place no matter what the player is holding down */
const HELD_INPUT: RacerInput = {
  left: false,
  right: false,
  gas: false,
  brake: false,
  steer: 0,
  gasAmt: 0,
  brakeAmt: 0,
};

/* live race bookkeeping per peer (standingsRef): the last state packet,
   the lobby name and the death notice once it arrives */
interface PeerStanding {
  name: string;
  state: NetCarState;
  dead: boolean;
  deadScore: number;
}

/* one row of the standings HUD / results panel */
interface StandingRow {
  id: string;
  name: string;
  score: number;
  dead: boolean;
  self: boolean;
  /** CPU ghost bot (leader-simulated) — tagged BOT in the UI */
  bot?: boolean;
}

/* CPU bot ids are always "cpu-N" (bots.ts) — the standings/spectate/
   race-over paths recognise them by the prefix */
const isBotId = (id: string) => id.startsWith("cpu-");

/* the game-over action row gains a SPECTATE entry in a VS race while at
   least one peer is still alive */
type GoSelection = "again" | "spectate" | "quit";

/* the armed-row layout per lobby view — shared by the keyboard handler
   and the JSX so the selection index always points at the same button */
const lobbyRowIds = (view: LobbyView, leader: boolean): string[] =>
  view === "home"
    ? ["name", "create", "join", "back"]
    : view === "room"
      ? leader
        ? ["name", "ready", "copy", "addbot", "removebot", "start", "leave"]
        : ["name", "ready", "copy", "leave"]
      : ["back"];

/* the player's display name — owned by the VS RACE lobby, persisted as
   "twingo:name" (up to 10 chars, A-Z 0-9 and space). The highscore
   initials moved to their own "twingo:initials" key; it's the middle
   fallback here so an old player who only ever submitted initials still
   gets them as their name */
const NAME_FILTER = /[^A-Z0-9 ]/g;
const sanitizeName = (v: string): string =>
  v.toUpperCase().replace(NAME_FILTER, "").slice(0, 10);
const savedName = (): string => {
  try {
    const n = (localStorage.getItem("twingo:name") ?? "").trim();
    if (/^[A-Z0-9 ]{1,10}$/.test(n)) return n;
    const i = localStorage.getItem("twingo:initials") ?? "";
    return /^[A-Z0-9]{3}$/.test(i) ? i : "YOU";
  } catch {
    return "YOU";
  }
};

/* highscore initials prefill: the dedicated "twingo:initials" key first,
   else derive from the display name — first 3 chars that exist in the
   spinner alphabet, padded with A. "" when nothing is saved (the form
   stays empty, same as before) */
const savedInitials = (): string => {
  try {
    const i = localStorage.getItem("twingo:initials") ?? "";
    if (/^[A-Z0-9]{3}$/.test(i)) return i;
    const n = savedName();
    if (n === "YOU") return "";
    const derived = [...n]
      .filter((c) => SPIN_CHARS.includes(c))
      .join("")
      .slice(0, 3);
    return derived.padEnd(3, "A");
  } catch {
    return "";
  }
};

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

/* spectate instruments: blocky 7-segment digits in the engine cluster's
   palette (a=top … g=middle, same segment order as the engine's own
   SEG_MAP) */
const SPEC_SEG: Record<string, readonly boolean[]> = {
  "0": [true, true, true, true, true, true, false],
  "1": [false, true, true, false, false, false, false],
  "2": [true, true, false, true, true, false, true],
  "3": [true, true, true, true, false, false, true],
  "4": [false, true, true, false, false, true, true],
  "5": [true, false, true, true, false, true, true],
  "6": [true, false, true, true, true, true, true],
  "7": [true, true, true, false, false, false, false],
  "8": [true, true, true, true, true, true, true],
  "9": [true, true, true, true, false, true, true],
};

function specDigit(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  ch: string,
  color: string,
) {
  const on = SPEC_SEG[ch];
  if (!on) return;
  const t = Math.max(1, Math.round(size * 0.2));
  const w = Math.round(size);
  const h = Math.round(size * 2);
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = color;
  if (on[0]) ctx.fillRect(x, y, w, t);
  if (on[1]) ctx.fillRect(x + w - t, y, t, Math.round(h / 2));
  if (on[2])
    ctx.fillRect(x + w - t, y + Math.round(h / 2), t, Math.round(h / 2));
  if (on[3]) ctx.fillRect(x, y + h - t, w, t);
  if (on[4]) ctx.fillRect(x, y + Math.round(h / 2), t, Math.round(h / 2));
  if (on[5]) ctx.fillRect(x, y, t, Math.round(h / 2));
  if (on[6]) ctx.fillRect(x, y + Math.round(h / 2 - t / 2), w, t);
}

/* spectate instruments restamp: covers the engine's LCD cluster rect
   wholesale (bottom-right desktop / top-left touch, 150×52 ui — the same
   geometry renderCluster uses) and redraws it with the FOLLOWED player's
   live speed + score. The local fuel gauge row is dropped — our tank is
   nobody's business once our own run is over */
function drawSpectateCluster(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  kmh: number,
  score: number,
  topLeft: boolean,
) {
  const ui = Math.min(width / RACER_WIDTH, height / RACER_HEIGHT);
  const pw = Math.round(150 * ui);
  const ph = Math.round(52 * ui);
  const x0 = topLeft ? Math.round(8 * ui) : width - pw - Math.round(8 * ui);
  const y0 = topLeft ? Math.round(16 * ui) : height - ph - Math.round(8 * ui);
  const pad = Math.round(3 * ui);
  const segColor = "#243320";
  const ghostColor = "rgba(36,51,32,0.10)";

  // bezel + LCD inset, covering the stale local cluster
  ctx.fillStyle = "#141611";
  ctx.beginPath();
  ctx.roundRect(x0, y0, pw, ph, Math.round(6 * ui));
  ctx.fill();
  ctx.fillStyle = "#a7c57d";
  ctx.beginPath();
  ctx.roundRect(
    x0 + pad,
    y0 + pad,
    pw - pad * 2,
    ph - pad * 2,
    Math.round(4 * ui),
  );
  ctx.fill();

  // big speed readout (the followed car's), ghost 8s behind live digits
  const size = 13 * ui;
  const gap = 3 * ui;
  const digitW = size + gap;
  const digitsX = x0 + pad + Math.round(7 * ui);
  const digitsY = y0 + pad + Math.round(12 * ui);
  const text = String(Math.min(999, Math.round(kmh))).padStart(3, " ");
  for (let i = 0; i < 3; i++) {
    specDigit(ctx, digitsX + i * digitW, digitsY, size, "8", ghostColor);
    if (text[i] !== " ") {
      specDigit(ctx, digitsX + i * digitW, digitsY, size, text[i], segColor);
    }
  }
  ctx.fillStyle = segColor;
  ctx.font = `${Math.round(6 * ui)}px monospace`;
  ctx.fillText(
    "km/h",
    digitsX + 3 * digitW + Math.round(2 * ui),
    digitsY + size * 2,
  );

  // followed score, top-right (where the real cluster shows the trip)
  const tSize = 5 * ui;
  const tW = tSize + 1.5 * ui;
  const scoreText = String(Math.floor(score)).padStart(5, " ");
  const scoreX = x0 + pw - pad - Math.round(7 * ui) - scoreText.length * tW;
  const scoreY = y0 + pad + Math.round(4 * ui);
  for (let i = 0; i < scoreText.length; i++) {
    specDigit(ctx, scoreX + i * tW, scoreY, tSize, "8", ghostColor);
    if (scoreText[i] !== " ") {
      specDigit(ctx, scoreX + i * tW, scoreY, tSize, scoreText[i], segColor);
    }
  }
}

export function TwingoRacer() {
  const [open, setOpen] = useState(false);
  /* the overlay opens on the title screen; the engine only boots once
     START is pressed (or PLAY AGAIN after a run). "lobby" is the VS RACE
     P2P room flow, which also ends in a normal run start */
  const [screen, setScreen] = useState<"title" | "playing" | "lobby">("title");
  /* title screen: which artwork button is armed for Enter, and whether
     the read-only leaderboard panel is open over the title. "race" is
     the VS RACE lobby chip (a DOM button, not painted artwork) */
  const [titleSel, setTitleSel] = useState<
    "start" | "board" | "race" | "settings"
  >("start");
  const [titleBoard, setTitleBoard] = useState(false);
  /* VS RACE lobby (P2P via Trystero): the net instance lives in a ref so
     the later gameplay-sync stage can stream car states through it
     mid-run; the view / roster / countdown are plain panel state */
  const [lobbyView, setLobbyView] = useState<LobbyView>("home");
  const [lobbySel, setLobbySel] = useState(0);
  const [joinCode, setJoinCode] = useState("");
  /* display name (up to 10 chars, A-Z 0-9 space): editable on the lobby
     home and room screens, persisted as "twingo:name"; while a room is
     attached, edits re-hello through net.setName (debounced) so the
     roster and the remote name tags update live */
  const [playerName, setPlayerName] = useState(() => savedName());
  const nameInputRef = useRef<HTMLInputElement>(null);
  const nameDebounceRef = useRef<number | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [peers, setPeers] = useState<RacePeer[]>([]);
  const [selfPeerId, setSelfPeerId] = useState("");
  /* netConnected flips on the first onPeersChanged; if it stays off for
     15 s the relay path is presumed slow/blocked and a Retry is offered */
  const [netConnected, setNetConnected] = useState(false);
  const [connectStuck, setConnectStuck] = useState(false);
  const [copied, setCopied] = useState(false);
  /* a VS race start/rematch the room announced: the engine boots
     IMMEDIATELY (cars idle on the grid behind the countdown overlay) and
     endsAt counts down RECEIPT-RELATIVE (s.ms after the message arrived,
     never an absolute timestamp — device clocks can be minutes apart).
     Driving input is suppressed while this is set; GO gates on the
     engine existing, so a slow sprite load just holds the overlay on
     "GO!" a moment longer */
  const [pendingRace, setPendingRace] = useState<{
    endsAt: number;
    seed: number;
  } | null>(null);
  const [countRemain, setCountRemain] = useState(0);
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
  /* game over: which action button is armed for Enter / pad A. ←/→ moves
     it; while the initials form is pending it owns the keys instead. A VS
     race adds SPECTATE (peers still alive) and turns PLAY AGAIN into
     REMATCH (results screen, lobby leader only) */
  const [goSel, setGoSel] = useState<GoSelection>("again");
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
  /* ALL four period boards, fetched at game-over time: the initials form
     must qualify against every window, not just the open tab — a 24H #1
     deserves its initials even while the ALL tab is showing */
  const [qualifyBoards, setQualifyBoards] = useState<Record<
    ScorePeriod,
    ScoreEntry[]
  > | null>(null);
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
  /* submit guards: a synchronous re-entry lock (the submitState closure
     lets two same-frame dispatches both pass) and the run the in-flight
     submit belongs to, so a late resolution can't poison a new run */
  const sendingRef = useRef(false);
  const runIdRef = useRef(0);
  runIdRef.current = runId;
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
  /* the live P2P room (null = single player). Kept across the countdown
     and the whole run so the gameplay-sync stage can stream states;
     leaveNet() drops it */
  const netRef = useRef<RaceNet | null>(null);
  /* generation guard: handlers of a replaced/abandoned net instance must
     not write into the new room's state (Retry re-creates the net) */
  const netGenRef = useRef(0);
  /* the latest roster exactly as onPeersChanged delivered it (sorted by
     joinedAt, index 0 = lobby leader) — the race-time code (start grid,
     seed lock, names) reads it without depending on render timing */
  const rosterRef = useRef<RacePeer[]>([]);
  const selfPeerIdRef = useRef("");
  /* live race standings: peers' last packets + death notices, updated by
     the net handlers at packet rate; the HUD reads it on a slow 4 Hz
     interval instead of re-rendering per packet */
  const standingsRef = useRef<Map<string, PeerStanding>>(new Map());
  const [standings, setStandings] = useState<StandingRow[]>([]);
  /* CPU ghost bots: the roster the leader broadcasts (`bots` action) —
     the leader additionally runs the simulation itself (botsSimRef,
     created per race at engine boot). Receivers only mirror the roster
     and render the streamed states */
  const [bots, setBots] = useState<RaceBot[]>([]);
  const botsRef = useRef<RaceBot[]>([]);
  const botsSimRef = useRef<Bot[] | null>(null);
  botsRef.current = bots;
  /* spectate mode after our own death: which peer the camera rides
     (null = not spectating). Ref mirror for the key/net handlers */
  const [spectating, setSpectating] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const spectatingRef = useRef<{ id: string; name: string } | null>(null);
  /* race results once EVERY participant is dead (incl. self): sorted rows
     + winner names. Null while the race is still on */
  const [raceResults, setRaceResults] = useState<{
    rows: StandingRow[];
    winners: string[];
  } | null>(null);
  const raceResultsRef = useRef<{
    rows: StandingRow[];
    winners: string[];
  } | null>(null);
  const isLeaderRef = useRef(false);
  const pendingRaceRef = useRef<{ endsAt: number; seed: number } | null>(null);
  /* the seed the CURRENT VS race is running on (the pending race's seed,
     remembered at engine boot): a mid-race RESTART replays the same
     layout instead of falling back to the daily track */
  const raceSeedRef = useRef<number | null>(null);
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
  /* game-over button selection mirrors (same stale-closure reason) */
  const goSelRef = useRef<GoSelection>("again");
  /* lobby row selection mirror for the window-level lobby key handler
     (same stale-closure reason as goSelRef) */
  const lobbySelRef = useRef(0);
  /* true while the initials form owns Enter/arrows on the game-over
     screen (score qualifies and hasn't been submitted yet) */
  const goFormPendingRef = useRef(false);
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
  /* the merged steering value actually applied this frame (-1..1 — pad
     analog, tilt or the digital flags, clamped): broadcast in the VS
     state packets so the remote cars render our steering frames */
  const steerOutRef = useRef(0);
  /* gamepad: latest polled continuous state (steer/gas/brake) merged into
     the engine input each frame; padConnected drives the hints HUD */
  const padInputRef = useRef<PadState | null>(null);
  const [padConnected, setPadConnected] = useState(false);
  const screenRef = useRef(screen);
  const titleBoardRef = useRef(titleBoard);
  /* true while the arcade initials spinner owns the pad (game over,
     qualifies, pad connected) — the poller routes edges to twingo:spin */
  const spinActiveRef = useRef(false);

  pausedRef.current = paused;
  pauseMenuRef.current = pauseMenu;
  pauseSelRef.current = pauseSel;
  goSelRef.current = goSel;
  lobbySelRef.current = lobbySel;
  showFpsRef.current = showFps;
  screenRef.current = screen;
  titleBoardRef.current = titleBoard;
  pendingRaceRef.current = pendingRace;

  /* ── VS RACE lobby (P2P) ── */

  /* the lobby leader is the peer with the oldest joinedAt — index 0 of
     the roster, which onPeersChanged delivers pre-sorted */
  const isLeader = peers.length > 0 && peers[0]?.id === selfPeerId;
  isLeaderRef.current = isLeader;
  const myReady = peers.find((p) => p.id === selfPeerId)?.ready ?? false;
  /* the leader's START RACE unlocks at ≥ 2 racers with everyone READY —
     CPU bots count toward the field (a solo leader + a bot can race),
     humans alone still need a second racer */
  const canStart =
    isLeader && peers.length + bots.length >= 2 && peers.every((p) => p.ready);
  /* ADD BOT caps the field (humans + bots) at MAX_RACERS */
  const canAddBot = isLeader && peers.length + bots.length < MAX_RACERS;

  /* ── VS RACE race-time flow (standings / spectate / results / rematch) ──
     All stable ([] deps): they touch refs + setState only, so the net
     handlers in joinNet can close over them safely */

  const setSpectateMode = useCallback(
    (v: { id: string; name: string } | null) => {
      spectatingRef.current = v;
      setSpectating(v);
    },
    [],
  );

  /* the peer the camera should ride: the highest-scoring participant that
     is still alive and still in the room (null = nobody worth watching) */
  const bestSpectateTarget = useCallback((): {
    id: string;
    name: string;
    state: NetCarState;
  } | null => {
    const rosterIds = new Set(rosterRef.current.map((p) => p.id));
    let best: { id: string; name: string; state: NetCarState } | null = null;
    for (const [id, p] of standingsRef.current) {
      // bots aren't in the (human) roster but stay spectatable — they're
      // immortal, so a dead human can always ride one
      if (p.dead || (!rosterIds.has(id) && !isBotId(id))) continue;
      if (!best || p.state.score > best.state.score)
        best = { id, name: p.name, state: p.state };
    }
    return best;
  }, []);

  /* the spectate target died or left: ride the next-best live peer, or
     drop out of spectate when nobody is left */
  const repickSpectate = useCallback(() => {
    if (!spectatingRef.current) return;
    const t = bestSpectateTarget();
    const e = engineRef.current;
    if (t && e) {
      e.setSpectate({
        id: t.id,
        pos: t.state.pos,
        x: t.state.x,
        speed: t.state.speed,
      });
      setSpectateMode({ id: t.id, name: t.name });
    } else {
      e?.setSpectate(null);
      setSpectateMode(null);
    }
  }, [bestSpectateTarget, setSpectateMode]);

  /* switch the camera to the previous/next ALIVE peer (standings order,
     wrap around) — ←/→ keys, pad LB/RB (twingo:board-step), or a tap on
     the spectate chip. A no-op with only one peer left alive */
  const cycleSpectate = useCallback(
    (dir: 1 | -1) => {
      const cur = spectatingRef.current;
      const e = engineRef.current;
      if (!cur || !e) return;
      const rosterIds = new Set(rosterRef.current.map((p) => p.id));
      const alive = [...standingsRef.current.entries()]
        .filter(([id, p]) => !p.dead && (rosterIds.has(id) || isBotId(id)))
        .sort((a, b) => b[1].state.score - a[1].state.score);
      if (alive.length < 2) return;
      const i = alive.findIndex(([id]) => id === cur.id);
      const next =
        alive[
          ((((i < 0 ? 0 : i) + dir) % alive.length) + alive.length) %
            alive.length
        ];
      audioRef.current?.menuMove();
      e.setSpectate({
        id: next[0],
        pos: next[1].state.pos,
        x: next[1].state.x,
        speed: next[1].state.speed,
      });
      setSpectateMode({ id: next[0], name: next[1].name });
    },
    [setSpectateMode],
  );

  /* race over = we are dead AND every HUMAN participant (a peer that sent
     at least one packet — a mid-race lobby idler never blocks this) is
     dead. CPU bots are immortal and EXCLUDED from the check, but they
     still rank in the results. Builds the results panel; spectate
     becomes moot */
  const checkRaceOver = useCallback(() => {
    const net = netRef.current;
    if (!net || !gameOverRef.current || raceResultsRef.current) return;
    const parts = [...standingsRef.current.entries()];
    const humans = parts.filter(([id]) => !isBotId(id));
    // an empty set would pass every() vacuously — require participants
    // (a bot-only field completes: the dead leader was a racer)
    if (parts.length === 0 || !humans.every(([, p]) => p.dead)) return;
    const nameOf = (id: string, fallback: string) =>
      rosterRef.current.find((p) => p.id === id)?.name ?? fallback;
    const rows: StandingRow[] = [
      {
        id: net.selfId,
        name: net.me.name,
        score: Math.floor(engineRef.current?.state.score ?? 0),
        dead: true,
        self: true,
      },
      ...parts.map(([id, p]) => ({
        id,
        name: nameOf(id, p.name || "???"),
        // bots never die — their LIVE score is the final one
        score: Math.floor(p.dead ? p.deadScore : p.state.score),
        dead: true,
        self: false,
        bot: isBotId(id),
      })),
    ].sort((a, b) => b.score - a.score);
    // a score tie is a shared win — keep it simple
    const top = rows[0]?.score ?? 0;
    const res = {
      rows,
      winners: rows.filter((r) => r.score === top).map((r) => r.name),
    };
    raceResultsRef.current = res;
    setRaceResults(res);
    engineRef.current?.setSpectate(null);
    setSpectateMode(null);
    // arm REMATCH for the leader, QUIT for everyone else
    const sel: GoSelection = isLeaderRef.current ? "again" : "quit";
    setGoSel(sel);
    goSelRef.current = sel;
  }, [setSpectateMode]);

  /* the game-over action list for the current situation — the keyboard
     handler and the buttons both read this so they never disagree */
  const goOptions = useCallback((): GoSelection[] => {
    if (!netRef.current) return ["again", "quit"];
    if (raceResultsRef.current)
      return isLeaderRef.current ? ["again", "quit"] : ["quit"];
    return bestSpectateTarget() ? ["spectate", "quit"] : ["quit"];
  }, [bestSpectateTarget]);

  const enterSpectate = useCallback(() => {
    const t = bestSpectateTarget();
    const e = engineRef.current;
    if (!t || !e) return;
    audioRef.current?.menuSelect();
    e.setSpectate({
      id: t.id,
      pos: t.state.pos,
      x: t.state.x,
      speed: t.state.speed,
    });
    setSpectateMode({ id: t.id, name: t.name });
  }, [bestSpectateTarget, setSpectateMode]);

  const exitSpectate = useCallback(() => {
    audioRef.current?.menuSelect();
    engineRef.current?.setSpectate(null);
    setSpectateMode(null);
  }, [setSpectateMode]);

  /* REMATCH (lobby leader, results screen): broadcasts a fresh random
     track seed — every client (us included, via TrysteroNet.rematch's
     local echo) boots the new layout at once and counts down its own
     START_COUNTDOWN_MS from receipt */
  const requestRematch = useCallback(() => {
    if (pendingRaceRef.current !== null) return; // countdown already running
    audioRef.current?.menuSelect();
    netRef.current?.rematch(newSeed());
  }, []);

  /* leave the P2P room: the LEAVE button, ESC, QUIT and ✕ all funnel
     through here */
  const leaveNet = useCallback(() => {
    netGenRef.current++;
    netRef.current?.leave();
    netRef.current = null;
    rosterRef.current = [];
    selfPeerIdRef.current = "";
    standingsRef.current.clear();
    botsRef.current = [];
    setBots([]);
    botsSimRef.current = null;
    engineRef.current?.setSpectate(null);
    setSpectateMode(null);
    raceResultsRef.current = null;
    setRaceResults(null);
    setPeers([]);
    setSelfPeerId("");
    setRoomCode("");
    setPendingRace(null);
    pendingRaceRef.current = null;
    raceSeedRef.current = null;
    setNetConnected(false);
    setConnectStuck(false);
  }, [setSpectateMode]);

  /* attach the bot roster to the CURRENT engine: ghost flag (collision
     pass-through, both ways) + the name tag. Called wherever bot ids are
     first learned (leader at engine boot, receivers via onBotsChanged)
     and again on the leader's state feed — a fresh engine per race
     forgets the flags */
  const attachBots = useCallback((list: RaceBot[]) => {
    const e = engineRef.current;
    if (!e) return;
    for (const b of list) {
      e.setRemoteGhost(b.id, true);
      e.setRemoteName(b.id, b.name);
    }
  }, []);

  /* ADD BOT (lobby leader): ids stay cpu-1..cpu-N with REMOVE taking the
     last one, so the roster always matches createBots(N, seed) 1:1.
     humans + bots capped at MAX_RACERS; receivers mirror via onBotsChanged */
  const addBot = useCallback(() => {
    const cur = botsRef.current;
    if (rosterRef.current.length + cur.length >= MAX_RACERS) return;
    audioRef.current?.menuSelect();
    const next: RaceBot[] = [
      ...cur,
      { id: `cpu-${cur.length + 1}`, name: `CPU ${cur.length + 1}` },
    ];
    botsRef.current = next;
    setBots(next);
    netRef.current?.setBots(next);
    attachBots(next);
  }, [attachBots]);

  const removeBot = useCallback(() => {
    const cur = botsRef.current;
    if (cur.length === 0) return;
    audioRef.current?.menuSelect();
    const removed = cur[cur.length - 1];
    const next = cur.slice(0, -1);
    botsRef.current = next;
    setBots(next);
    netRef.current?.setBots(next);
    engineRef.current?.removeRemote(removed.id);
    standingsRef.current.delete(removed.id);
  }, []);

  /* PLAY AGAIN: drop the engine and re-run the boot effect cleanly. In a
     VS race this is also the per-client rematch reset (fired by startRun
     when a rematch arrives): the net itself survives — same room, fresh
     grid slots and a fresh per-race track seed at engine boot */
  const playAgain = useCallback(() => {
    audioRef.current?.menuSelect();
    audioRef.current?.setInterior(false);
    engineRef.current = null;
    gameOverRef.current = false;
    keysRef.current = { left: false, right: false, gas: false, brake: false };
    // VS race run state: standings/spectate/results belong to the run
    standingsRef.current.clear();
    spectatingRef.current = null;
    setSpectating(null);
    raceResultsRef.current = null;
    setRaceResults(null);
    setGameOver(false);
    setQualifyBoards(null);
    setPauseMenu(false);
    setPaused(false);
    setView("chase"); // every run starts on the chase cam
    setRunId((r) => r + 1);
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

  /* a VS race start/rematch just arrived: set the pending race (the
     countdown effect + the input suppression key off it) and boot the
     engine IMMEDIATELY through the normal START path — the cars sit on
     the grid idling while the countdown runs over the canvas. A rematch
     lands on the game-over/results screen, where startRun's playAgain
     reset rebuilds the run; a mid-race lobby idler gets pulled in the
     same way */
  const beginVsRace = useCallback(
    (seed: number, ms: number) => {
      pendingRaceRef.current = { endsAt: Date.now() + ms, seed };
      setPendingRace(pendingRaceRef.current);
      setCountRemain(ms);
      startRun();
    },
    [startRun],
  );

  /* create (or re-create, on Retry) the Trystero room. The handlers close
     over setState + the hello + stable race-flow callbacks + refs — never
     the net instance itself: LoopbackNet fires onPeersChanged synchronously
     from its constructor, before the instance exists. The engine is
     recreated every race, so handlers always resolve it through
     engineRef at call time */
  const joinNet = useCallback(
    (code: string) => {
      netRef.current?.leave();
      const gen = ++netGenRef.current;
      const hello: RaceHello = {
        name: savedName(),
        seed: turkeyDay(),
        joinedAt: Date.now(),
        ready: false,
      };
      const rosterName = (id: string) =>
        rosterRef.current.find((p) => p.id === id)?.name ?? "";
      let delivered = false;
      const net = new TrysteroNet(code.toUpperCase(), hello, {
        onPeersChanged: (ps) => {
          if (gen !== netGenRef.current) return; // a stale net (leave/retry)
          delivered = true;
          setNetConnected(true);
          // over capacity and WE are the newest arrival → bounced. The
          // leave itself runs in the lobbyView === "full" effect below —
          // the net instance isn't reliably reachable from in here. CPU
          // bots count against the cap (humans + bots ≤ MAX_RACERS)
          const newest = Math.max(...ps.map((p) => p.joinedAt));
          if (
            ps.length + botsRef.current.length > MAX_RACERS &&
            hello.joinedAt >= newest
          ) {
            setLobbyView("full");
            return;
          }
          // a newcomer (or a leadership change) needs the bot roster —
          // the leader re-announces it. Deferred to a microtask: the
          // net instance isn't assigned to netRef yet when LoopbackNet
          // fires this synchronously from its constructor
          queueMicrotask(() => {
            if (
              gen === netGenRef.current &&
              isLeaderRef.current &&
              botsRef.current.length > 0
            )
              netRef.current?.setBots(botsRef.current);
          });
          // race-time bookkeeping: name the live remote cars, drop the
          // departed ones (their standings row goes with them)
          const prevIds = rosterRef.current.map((p) => p.id);
          rosterRef.current = ps;
          const ids = new Set(ps.map((p) => p.id));
          const e = engineRef.current;
          if (e) {
            for (const p of ps)
              if (p.id !== selfPeerIdRef.current) e.setRemoteName(p.id, p.name);
            for (const oldId of prevIds)
              if (!ids.has(oldId) && oldId !== selfPeerIdRef.current)
                e.removeRemote(oldId);
          }
          for (const oldId of prevIds)
            if (!ids.has(oldId)) standingsRef.current.delete(oldId);
          setPeers(ps);
          // the spectate target may have just left; a departure can also
          // complete the all-dead set
          if (spectatingRef.current && !ids.has(spectatingRef.current.id))
            repickSpectate();
          checkRaceOver();
        },
        onStart: (s) => {
          if (gen !== netGenRef.current) return;
          // a start only counts while we're actually waiting in the lobby
          if (screenRef.current !== "lobby") return;
          beginVsRace(s.seed, s.ms);
        },
        onState: (id, s) => {
          if (gen !== netGenRef.current) return;
          const e = engineRef.current;
          e?.setRemoteState(id, s);
          // the name may have arrived (onPeersChanged) before the first
          // packet created the remote entry — re-attach it here too
          const name = rosterName(id);
          if (e && name) e.setRemoteName(id, name);
          const prev = standingsRef.current.get(id);
          const dead = prev?.dead || s.dead;
          standingsRef.current.set(id, {
            name: name || prev?.name || "???",
            state: s,
            dead,
            deadScore: prev?.dead ? prev.deadScore : s.dead ? s.score : 0,
          });
          if (s.dead && !prev?.dead) {
            // a state packet can carry the death flag before/with the
            // dead message — mark the wreck either way
            e?.markRemoteDead(id, s.score);
            if (spectatingRef.current?.id === id) repickSpectate();
            checkRaceOver();
          } else if (spectatingRef.current?.id === id && !dead) {
            // keep the camera riding the spectate target
            e?.setSpectate({ id, pos: s.pos, x: s.x, speed: s.speed });
          }
        },
        onTake: (_id, segIdx) => {
          if (gen !== netGenRef.current) return;
          engineRef.current?.applyRemoteTake(segIdx);
        },
        onHole: (_id, segIdx) => {
          if (gen !== netGenRef.current) return;
          engineRef.current?.applyRemoteHole(segIdx);
        },
        onDead: (id, score) => {
          if (gen !== netGenRef.current) return;
          engineRef.current?.markRemoteDead(id, score);
          const prev = standingsRef.current.get(id);
          standingsRef.current.set(id, {
            name: rosterName(id) || prev?.name || "???",
            state: prev?.state ?? {
              pos: 0,
              x: 0,
              speed: 0,
              score,
              dead: true,
            },
            dead: true,
            deadScore: score,
          });
          if (spectatingRef.current?.id === id) repickSpectate();
          checkRaceOver();
        },
        onRematch: (seed) => {
          if (gen !== netGenRef.current) return;
          // the leader rolled a fresh per-race track seed: every client
          // boots the new layout at once and counts down its own
          // START_COUNTDOWN_MS from receipt — playAgain (via startRun)
          // resets the finished run, then the engine rebuilds off the
          // CURRENT roster's grid slots
          beginVsRace(seed, START_COUNTDOWN_MS);
        },
        onBotsChanged: (bs) => {
          if (gen !== netGenRef.current) return;
          // the leader's bot roster, mirrored wholesale (receivers never
          // simulate — they render the streamed states as ghost remotes)
          botsRef.current = bs;
          setBots(bs);
          attachBots(bs);
        },
        onBotState: (id, name, s) => {
          if (gen !== netGenRef.current) return;
          const e = engineRef.current;
          e?.setRemoteState(id, s);
          e?.setRemoteName(id, name);
          // bots are pass-through ghosts on EVERY client (idempotent)
          e?.setRemoteGhost(id, true);
          standingsRef.current.set(id, {
            name,
            state: s,
            dead: false, // bots are immortal
            deadScore: 0,
          });
          // keep the camera riding a spectated bot
          if (spectatingRef.current?.id === id) {
            e?.setSpectate({ id, pos: s.pos, x: s.x, speed: s.speed });
          }
        },
      });
      netRef.current = net;
      setSelfPeerId(net.selfId);
      selfPeerIdRef.current = net.selfId;
      setRoomCode(net.code);
      setNetConnected(false);
      setConnectStuck(false);
      setCopied(false);
      setJoinCode("");
      // row 0 is the NAME input — land on READY so a quick Enter still
      // readies up instead of focusing the text field
      setLobbySel(1);
      setLobbyView("room");
      // alone in a room TrysteroNet never emits — show ourselves at once
      if (!delivered) {
        rosterRef.current = [{ id: net.selfId, ...hello }];
        setPeers([{ id: net.selfId, ...hello }]);
      }
    },
    [repickSpectate, checkRaceOver, beginVsRace, attachBots],
  );

  /* shareable join link: <origin>/<lang>/?race=CODE — the lang comes from
     the current path (the component itself doesn't know the locale) */
  const copyRaceLink = useCallback(() => {
    audioRef.current?.menuSelect();
    const lang =
      /^\/([a-z]{2})(?:\/|$)/.exec(window.location.pathname)?.[1] ?? "en";
    const url = `${window.location.origin}/${lang}/?race=${roomCode}`;
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    };
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {}
      ta.remove();
      done();
    };
    if (navigator.clipboard?.writeText)
      navigator.clipboard.writeText(url).then(done, fallback);
    else fallback();
  }, [roomCode]);

  /* VS RACE chip on the title screen: open the lobby panel */
  const openLobby = useCallback(() => {
    audioRef.current?.menuSelect();
    setScreen("lobby");
    setLobbyView("home");
    // row 0 is the NAME input — land on CREATE ROOM
    setLobbySel(1);
    setJoinCode("");
  }, []);

  /* announce the current name to the room (no-op solo — netRef is null).
     Empty trims down to the "YOU" fallback so the roster never shows a
     blank tag; peers keep the original joinedAt/seed on the re-hello */
  const pushName = useCallback((raw: string) => {
    const name = sanitizeName(raw).trim() || "YOU";
    netRef.current?.setName(name);
  }, []);

  /* name input: sanitize live (uppercase, A-Z 0-9 space, ≤10), persist,
     and debounce the re-hello ~400 ms — blur/Enter flush it immediately */
  const changeName = useCallback(
    (v: string) => {
      const clean = sanitizeName(v);
      setPlayerName(clean);
      try {
        localStorage.setItem("twingo:name", clean.trim());
      } catch {}
      if (nameDebounceRef.current !== null)
        window.clearTimeout(nameDebounceRef.current);
      nameDebounceRef.current = window.setTimeout(() => {
        nameDebounceRef.current = null;
        pushName(clean);
      }, 400);
    },
    [pushName],
  );

  const flushName = useCallback(() => {
    if (nameDebounceRef.current !== null) {
      window.clearTimeout(nameDebounceRef.current);
      nameDebounceRef.current = null;
      pushName(playerName);
    }
  }, [pushName, playerName]);

  /* each run gets a fresh single-use submit token; PLAY AGAIN re-issues.
     On failure the leaderboard UI stays hidden and the game just plays.
     Gated on actually starting a run so idling on the title screen never
     burns a token. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: runId intentionally re-issues a token when PLAY AGAIN starts a new run
  useEffect(() => {
    if (!open || screen !== "playing") return;
    tokenRef.current = null;
    setBoard(null);
    setInitials(savedInitials());
    setSubmitState("idle");
    setMyRank(null);
    // stale-score poison: finalScore survives across runs (it's only
    // written at game over) — zero it so nothing upstream can ever
    // submit or qualify the PREVIOUS run's number again
    setFinalScore(0);
    setFinalTime(0);
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
    // synchronous re-entry lock: the old submitState-closure guard let
    // two same-frame dispatches (spinner confirm + Start) both pass
    if (!token || initials.length !== 3 || sendingRef.current) return;
    sendingRef.current = true;
    // consume the token client-side up front — no path can fire the same
    // token twice even before the server gets a say
    tokenRef.current = null;
    const runAtSubmit = runIdRef.current;
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
      // a late resolution landing in a NEW run must not poison its form
      // state (that once hid the initials form + showed a stale RANK)
      if (runIdRef.current !== runAtSubmit) return;
      setMyRank(d.rank);
      // the submit response carries the all-time top-10 and the rank is
      // an all-time rank — pin the visible tab to ALL so they line up.
      // Bump the board generation so the game-over-time fetch (possibly
      // still in flight, possibly stale-cached) can't overwrite this
      boardGenRef.current++;
      setBoardPeriod("all");
      setBoard(d.scores);
      setSubmitState("done");
      // remember the initials in their OWN key — "twingo:name" belongs to
      // the lobby display name now (the form prefills from them next run)
      try {
        localStorage.setItem("twingo:initials", initials);
      } catch {}
    } catch {
      // failed before/without consuming server-side (network, invalid
      // input): hand the token back so the retry button works
      if (runIdRef.current === runAtSubmit) {
        tokenRef.current = token;
        setSubmitState("error");
      }
    } finally {
      sendingRef.current = false;
    }
  }, [initials, finalScore, finalTime]);

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

  const close = useCallback(() => {
    audioRef.current?.stop();
    leaveNet();
    setLobbyView("home");
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
  }, [leaveNet]);

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
    // a VS race room ends here too — the next VS RACE starts a fresh lobby
    leaveNet();
    setLobbyView("home");
    // silence the engine hum; the music keeps playing over the title art
    audioRef.current?.menuSelect();
    audioRef.current?.setInterior(false);
    audioRef.current?.drive(0, false, false, 0, 0, false, 0, false);
    setGameOver(false);
    setQualifyBoards(null);
    setPauseMenu(false);
    setPauseSettingsOpen(false);
    setPaused(false);
    setScreen("title");
    setTitleSel("start");
    setTitleBoard(false);
    setTitleSettingsOpen(false);
  }, [leaveNet]);

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

  /* LB/RB on a gamepad steps the leaderboard period tabs — but only
     while a board is actually on screen (title panel or the game-over
     overlay), never mid-run. While spectating they switch the camera
     between alive peers instead (the board is hidden behind the ride) */
  useEffect(() => {
    if (!open) return;
    const order: ScorePeriod[] = ["all", "monthly", "weekly", "daily"];
    const onStep = (ev: Event) => {
      const dir = (ev as CustomEvent<number>).detail;
      if (spectatingRef.current) {
        cycleSpectate(dir > 0 ? 1 : -1);
        return;
      }
      const visible =
        screenRef.current === "title"
          ? titleBoardRef.current
          : gameOverRef.current;
      if (!visible) return;
      const i = order.indexOf(boardPeriodRef.current);
      const next = order[(i + (dir > 0 ? 1 : order.length - 1)) % order.length];
      audioRef.current?.menuMove();
      selectPeriod(next);
    };
    window.addEventListener("twingo:board-step", onStep);
    return () => window.removeEventListener("twingo:board-step", onStep);
  }, [open, selectPeriod, cycleSpectate]);

  /* LEADERBOARD on the title screen: read-only top-10 panel — no token
     needed to look, only to submit after a run */
  const openTitleBoard = useCallback(() => {
    setTitleBoard(true);
    fetchBoard(boardPeriod);
  }, [fetchBoard, boardPeriod]);

  /* bounced from a full room: drop the connection here. The peers handler
     only flips the view — it can't touch the net instance (LoopbackNet
     delivers peers synchronously from its constructor, before the
     instance exists) */
  useEffect(() => {
    if (lobbyView !== "full") return;
    netRef.current?.leave();
    netRef.current = null;
    setPeers([]);
    setNetConnected(false);
  }, [lobbyView]);

  /* connection failure tolerance: no peer traffic within 15 s of joining
     (relay slow/blocked) → a subtle CONNECTING… + RETRY that re-creates
     the room */
  // biome-ignore lint/correctness/useExhaustiveDependencies: roomCode intentionally re-arms the timer after a Retry re-creates the room (netConnected stays false, so it alone wouldn't re-fire)
  useEffect(() => {
    if (lobbyView !== "room" || netConnected) return;
    const id = window.setTimeout(() => setConnectStuck(true), 15000);
    return () => window.clearTimeout(id);
  }, [lobbyView, netConnected, roomCode]);

  /* VS race countdown ON THE TRACK: the engine boots the moment the
     start/rematch arrives (beginVsRace) and idles on the grid — the
     frame loop feeds it HELD_INPUT while pendingRace is set, so nobody
     moves. This ticker counts down from receipt (each client on its own
     clock; the GO beats land within one-way relay latency of each
     other). GO gates on the engine existing: if the sprite load outlives
     the countdown the overlay simply holds on "GO!" until engineRef is
     there, then the start cue plays and the throttle releases */
  useEffect(() => {
    if (pendingRace === null) return;
    const tick = () => {
      const rem = Math.max(0, pendingRace.endsAt - Date.now());
      setCountRemain(rem);
      if (rem === 0 && engineRef.current) {
        pendingRaceRef.current = null;
        setPendingRace(null);
        audioRef.current?.menuSelect(); // the GO start cue
      }
    };
    tick();
    const id = window.setInterval(tick, 60);
    return () => window.clearInterval(id);
  }, [pendingRace]);

  /* standings HUD + spectate watchdog: remote packets land in
     standingsRef at 20 Hz per peer — far too hot for React. This 4 Hz
     ticker composes the sorted rows (self from the live engine state)
     and setStates only when something actually changed. It also re-picks
     a lost spectate target in case a death/departure edge was missed */
  useEffect(() => {
    if (!open || screen !== "playing") return;
    const tick = () => {
      const net = netRef.current;
      if (!net) {
        setStandings((s) => (s.length ? [] : s));
        return;
      }
      if (spectatingRef.current) {
        const cur = standingsRef.current.get(spectatingRef.current.id);
        if (!cur || cur.dead) repickSpectate();
      }
      const rows: StandingRow[] = [
        {
          id: net.selfId,
          name: net.me.name,
          score: Math.floor(engineRef.current?.state.score ?? 0),
          dead: gameOverRef.current,
          self: true,
        },
      ];
      for (const [id, p] of standingsRef.current) {
        rows.push({
          id,
          name: p.name || "???",
          score: Math.floor(p.dead ? p.deadScore : p.state.score),
          dead: p.dead,
          self: false,
          bot: isBotId(id),
        });
      }
      rows.sort((a, b) => b.score - a.score);
      setStandings((prev) =>
        prev.length === rows.length &&
        prev.every(
          (r, i) =>
            r.id === rows[i].id &&
            r.name === rows[i].name &&
            r.score === rows[i].score &&
            r.dead === rows[i].dead,
        )
          ? prev
          : rows,
      );
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [open, screen, repickSpectate]);

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

  /* the START buttons dispatch "twingo:start" — the overlay opens on the
     title screen, the engine boots only when START is pressed there.
     The click is a user gesture, so the audio context is born here. The
     ?race= link flow opens the overlay through the same path (no gesture
     there — the context stays suspended until the first input, which
     pays the resume through the usual ensureRunning entry points) */
  const openOverlay = useCallback(() => {
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
  }, []);

  useEffect(() => {
    window.addEventListener("twingo:start", openOverlay);
    return () => window.removeEventListener("twingo:start", openOverlay);
  }, [openOverlay]);

  /* ?race=CODE share link: auto-open the overlay straight into that
     room's lobby (joins immediately — the room code is validated against
     the same alphabet the JOIN input enforces) */
  useEffect(() => {
    const code = new URLSearchParams(window.location.search)
      .get("race")
      ?.toUpperCase();
    if (!code || !VALID_ROOM.test(code)) return;
    openOverlay();
    setScreen("lobby");
    joinNet(code);
  }, [openOverlay, joinNet]);

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
        const order = ["start", "board", "race", "settings"] as const;
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
        else if (titleSel === "race") openLobby();
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
    openLobby,
    toggleMute,
    adjustVol,
    toggleTilt,
    adjustTiltSens,
  ]);

  /* lobby keyboard control — the gamepad poller turns pad presses into
     synthetic keyboard events, so pads work here with zero extra code:
     ↑/↓ arm a row, Enter/Space activates, ESC steps back (in a room it
     also drops the net, same as LEAVE). The text inputs own the keys
     while focused — the JOIN code input stops propagation like the
     initials input, the NAME row is part of the nav (Enter focuses it,
     ESC inside blurs back to the nav) */
  useEffect(() => {
    if (!open || screen !== "lobby") return;
    const rows = lobbyRowIds(lobbyView, isLeader);
    const activate = (row: string) => {
      if (row === "name") {
        // arming the NAME row + Enter focuses the input (typing itself is
        // keyboard-only — same limitation as the JOIN code input)
        audioRef.current?.menuSelect();
        nameInputRef.current?.focus();
      } else if (row === "create") {
        audioRef.current?.menuSelect();
        joinNet(makeRoomCode());
      } else if (row === "join") {
        audioRef.current?.menuSelect();
        setLobbyView("join");
      } else if (row === "ready") {
        audioRef.current?.menuSelect();
        netRef.current?.setReady(!myReady);
      } else if (row === "copy") {
        copyRaceLink();
      } else if (row === "addbot") {
        addBot();
      } else if (row === "removebot") {
        removeBot();
      } else if (row === "start") {
        if (canStart) {
          audioRef.current?.menuSelect();
          netRef.current?.startRace(newSeed());
        }
      } else {
        // back / leave: drop the room and return to the title
        audioRef.current?.menuSelect();
        leaveNet();
        setLobbyView("home");
        setScreen("title");
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      // a focused text input owns the keys (real events stop propagation
      // before reaching us, but pad-synthesised ones target window): ESC
      // blurs the NAME input back into the row nav, everything else is
      // left to the field so arrows edit the text instead of the menu.
      // The JOIN view is exempt — its input stops real propagation
      // itself and the view-level ESC path must keep working for pads
      const ae = document.activeElement;
      if (
        lobbyView !== "join" &&
        (ev.target instanceof HTMLInputElement ||
          ae instanceof HTMLInputElement)
      ) {
        if (ev.key === "Escape" && ae === nameInputRef.current) {
          ev.preventDefault();
          flushName();
          nameInputRef.current?.blur();
        }
        return;
      }
      if (ev.key === "Escape") {
        if (lobbyView === "join") setLobbyView("home");
        else {
          leaveNet();
          setLobbyView("home");
          setScreen("title");
        }
        return;
      }
      if (lobbyView === "join" || lobbyView === "full") return;
      const k = ev.key.toLowerCase();
      if (k === "arrowup" || k === "arrowdown" || k === "w" || k === "s") {
        ev.preventDefault();
        audioRef.current?.menuMove();
        const step = k === "arrowup" || k === "w" ? rows.length - 1 : 1;
        setLobbySel((s) => (Math.min(s, rows.length - 1) + step) % rows.length);
        return;
      }
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        activate(rows[Math.min(lobbySelRef.current, rows.length - 1)]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    open,
    screen,
    lobbyView,
    isLeader,
    canStart,
    myReady,
    joinNet,
    leaveNet,
    copyRaceLink,
    flushName,
    addBot,
    removeBot,
  ]);

  /* gamepad: one rAF poller for the whole overlay (the title screen has
     no engine loop). Continuous state (steer/gas/brake) lands in
     padInputRef for the game loop to merge; edge presses become synthetic
     keyboard events, so every existing menu handler (title, settings,
     pause, leaderboard, game over) works with ZERO changes — d-pad/stick
     = arrows, A = Enter, B/Start = Escape, Y = V, Select = R. Typing
     initials stays keyboard-only */
  useEffect(() => {
    if (!open) return;
    const keyFor: Record<Exclude<PadAction, "tabLeft" | "tabRight">, string> = {
      up: "ArrowUp",
      down: "ArrowDown",
      left: "ArrowLeft",
      right: "ArrowRight",
      confirm: "Enter",
      back: "Escape",
      pause: "Escape",
      camera: "v",
      restart: "r",
    };
    let raf = 0;
    let connected = false;
    let spinRepDir: string | null = null;
    let spinRepAt = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const pad = pollPad();
      padInputRef.current = pad;
      const now = !!pad;
      if (now !== connected) {
        connected = now;
        setPadConnected(now);
      }
      if (!pad) return;
      // arcade initials spinner owns the pad while it's on screen: edges
      // go out as a dedicated event (Start = send the score), and a HELD
      // direction auto-repeats like the joystick scroll of the originals
      // (380 ms delay, then every 110 ms)
      if (spinActiveRef.current) {
        for (const action of pad.pressed) {
          if (
            action === "up" ||
            action === "down" ||
            action === "left" ||
            action === "right" ||
            action === "confirm" ||
            action === "back"
          )
            window.dispatchEvent(
              new CustomEvent("twingo:spin", { detail: action }),
            );
          else if (action === "pause")
            window.dispatchEvent(
              new CustomEvent("twingo:spin", { detail: "submit" }),
            );
          // restart/camera/tabs stay dead: a stray Select must not nuke
          // an unsubmitted score
        }
        const dir =
          pad.menuY !== 0
            ? pad.menuY < 0
              ? "up"
              : "down"
            : pad.menuX !== 0
              ? pad.menuX < 0
                ? "left"
                : "right"
              : null;
        const t = performance.now();
        if (dir !== spinRepDir) {
          spinRepDir = dir;
          spinRepAt = t + 380;
        } else if (dir && t >= spinRepAt) {
          window.dispatchEvent(new CustomEvent("twingo:spin", { detail: dir }));
          spinRepAt = t + 110;
        }
        return;
      }
      spinRepDir = null;
      // the quick-pause overlay (PAUSED — …) resumes on ANY pad press,
      // like its click/tap — and must NOT also dispatch the press as a
      // synthetic Escape, or the pause menu would open right on top
      if (
        pad.pressed.size > 0 &&
        screenRef.current === "playing" &&
        pausedRef.current &&
        !pauseMenuRef.current &&
        !gameOverRef.current
      ) {
        setPaused(false);
        return;
      }
      // while actually driving, the d-pad/stick are steering ONLY: their
      // menu arrows double as the keyboard drive keys, and a synthetic
      // keydown without a keyup would latch gas/brake/steer on
      const driving =
        screenRef.current === "playing" &&
        !pausedRef.current &&
        !pauseMenuRef.current &&
        !gameOverRef.current;
      for (const action of pad.pressed) {
        if (
          driving &&
          (action === "up" ||
            action === "down" ||
            action === "left" ||
            action === "right")
        )
          continue;
        // LB/RB step the leaderboard period tabs — no keyboard
        // equivalent, so they go out as a dedicated event instead of a
        // synthetic key
        if (action === "tabLeft" || action === "tabRight") {
          window.dispatchEvent(
            new CustomEvent("twingo:board-step", {
              detail: action === "tabRight" ? 1 : -1,
            }),
          );
          continue;
        }
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: keyFor[action] }),
        );
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      padInputRef.current = null;
      setPadConnected(false);
    };
  }, [open]);

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
        // analog steering priority: gamepad stick > tilt > the digital
        // left/right flags (the engine's steer overrides those anyway)
        const pad = padInputRef.current;
        if (pad?.steer != null) keysRef.current.steer = pad.steer;
        else if (tiltRef.current) keysRef.current.steer = steerRef.current;
        else delete keysRef.current.steer;
        // pad pedals merge with the keyboard as analog amounts — the
        // trigger pull wins if deeper, so feathering RT works even while
        // a key is held
        if (pad) {
          keysRef.current.gasAmt = Math.max(
            keysRef.current.gas ? 1 : 0,
            pad.gasAmt,
          );
          keysRef.current.brakeAmt = Math.max(
            keysRef.current.brake ? 1 : 0,
            pad.brakeAmt,
          );
        } else {
          delete keysRef.current.gasAmt;
          delete keysRef.current.brakeAmt;
        }
        const gasOn =
          (keysRef.current.gasAmt ?? (keysRef.current.gas ? 1 : 0)) > 0.05;
        const brakeOn =
          (keysRef.current.brakeAmt ?? (keysRef.current.brake ? 1 : 0)) > 0.05;
        // VS race countdown: the engine is on the grid but ALL driving
        // input is suppressed until GO (keyboard, pad AND tilt — the
        // merge above is overridden, not skipped, so nothing latches on
        // at the release). Solo runs never see a pending race
        const hold = pendingRaceRef.current !== null;
        steerOutRef.current = hold
          ? 0
          : Math.max(
              -1,
              Math.min(
                1,
                keysRef.current.steer ??
                  (keysRef.current.left ? -1 : 0) +
                    (keysRef.current.right ? 1 : 0),
              ),
            );
        e.update(dt, hold ? HELD_INPUT : keysRef.current);
        // CPU bots (lobby leader's sim): advance with the same dt, fed
        // the CURRENT-segment curve only (engine.curveAt — no preview)
        // and the human poses for rubber banding + mild avoidance. Held
        // with the grid during the countdown like the human cars; keeps
        // running after the leader's own death (bots are immortal and
        // stay spectatable)
        const sim = botsSimRef.current;
        if (sim && !hold) {
          const humans: { pos: number; x: number }[] = [
            { pos: e.state.position, x: e.state.playerX },
          ];
          for (const [id, p] of standingsRef.current) {
            if (isBotId(id) || p.dead) continue;
            humans.push({ pos: p.state.pos, x: p.state.x });
          }
          updateBots(sim, dt, (pos) => e.curveAt(pos), humans);
        }
        e.render(ctx);
        // spectate instruments: the canvas LCD cluster still shows OUR
        // finished run's frozen score/fuel — restamp it with the followed
        // player's live numbers (their latest state packet), so the ride
        // reads like driving that car. The hearts/streak HUDs are gone
        // already (the engine gates them on !gameOver)
        const spec = spectatingRef.current;
        if (spec) {
          const pk = standingsRef.current.get(spec.id)?.state;
          if (pk) {
            drawSpectateCluster(
              ctx,
              buf.w,
              buf.h,
              (pk.speed / ENGINE_CONSTANTS.MAX_SPEED) * 180,
              pk.score,
              coarseRef.current,
            );
          }
        }
        // after the tank ran dry the engine stays silent — gameOver()
        // already faded it out; drive() would revive an idle drone
        if (!gameOverRef.current) {
          audioRef.current?.setPaused(false);
          audioRef.current?.drive(
            e.state.speed / ENGINE_CONSTANTS.MAX_SPEED,
            !hold && gasOn,
            !hold && brakeOn,
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
          if (netRef.current) {
            // VS race: report the death, then arm SPECTATE while at least
            // one peer is still out there (checkRaceOver may immediately
            // flip to RESULTS + REMATCH if we were the last one alive)
            netRef.current.sendDead(Math.floor(e.state.score));
            const sel: GoSelection = bestSpectateTarget() ? "spectate" : "quit";
            setGoSel(sel);
            goSelRef.current = sel;
            checkRaceOver();
          } else {
            setGoSel("again");
            goSelRef.current = "again";
          }
          // fetch the current period's top-10 alongside the overlay
          fetchBoard(boardPeriodRef.current);
          // ...and ALL four periods for the qualify check — the initials
          // form must not depend on which tab happens to be open
          setQualifyBoards(null);
          const PERIODS: ScorePeriod[] = ["all", "monthly", "weekly", "daily"];
          void Promise.all(
            PERIODS.map((p) =>
              fetch(`/api/highscore?period=${p}`, { cache: "no-store" })
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null),
            ),
          ).then((boards) => {
            const out = {} as Record<ScorePeriod, ScoreEntry[]>;
            boards.forEach((d: { scores?: ScoreEntry[] } | null, i) => {
              out[PERIODS[i]] = d?.scores ?? [];
            });
            setQualifyBoards(out);
          });
        }
      } else if (pausedRef.current) {
        // frozen run: silence the car, leave the music playing
        audioRef.current?.setPaused(true);
      }
      raf = requestAnimationFrame(frame);
    };

    (async () => {
      if (!engineRef.current) {
        const [car, gasCan, cockpit, cat] = await Promise.all([
          loadCarFrames(),
          loadGasCan(),
          loadCockpit(),
          loadCat(),
        ]);
        if (cancelled) return;
        cockpitReadyRef.current = cockpit !== null;
        setCockpitReady(cockpit !== null);
        // solo races the daily track: everyone races the same layout on
        // the same Turkey-time day (midnight TR, UTC+3), so same-day
        // highscores are comparable — a fresh track every day. A VS race
        // runs the pending race's RANDOM seed instead (per-race layout
        // the leader rolled; a rematch is a fresh roll, never the daily
        // track). A mid-race RESTART (pending already consumed at GO)
        // replays the current race's seed.
        // The seeded generator deals sections forever under its geometric
        // limits (alternating curve sides, sea-level-sprung hills)
        const net = netRef.current;
        const roster = net ? rosterRef.current : [];
        const seed = net
          ? (pendingRaceRef.current?.seed ?? raceSeedRef.current ?? turkeyDay())
          : turkeyDay();
        if (net) raceSeedRef.current = seed;
        const { segments, extend, firstIndex, generated } =
          createTrackGenerator(seed);
        // the difficulty card is normally rated while the title sits open;
        // an impatient START within that beat re-rates here synchronously
        // (same seed, same result) so scarcity never falls back blind. A
        // VS race seed never matches the daily card, so every race rates
        // its own layout
        const stats =
          trackStats && seed === turkeyDay()
            ? trackStats
            : analyzeTrack(seed, 3000);
        // start grid: lateral + along-track slot by roster index (join
        // order; the 5th arrival takes the back row 3 segments behind
        // the line) — solo races pass NOTHING so single-player behaviour
        // is byte-identical. CPU bots take the slots AFTER the humans
        // (joinedAt order), so the grid TABLE is sized humans + bots —
        // a bot can be the one pushed to the back row
        const totalRacers = roster.length + botsRef.current.length;
        const myIdx = net ? roster.findIndex((p) => p.id === net.selfId) : -1;
        const slot =
          net && myIdx >= 0
            ? RACE_GRID[
                Math.min(Math.max(totalRacers, 1), RACE_GRID.length) - 1
              ][myIdx]
            : undefined;
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
          cat,
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
          onCatHit: () => audioRef.current?.catHit(),
          onBracket: () => audioRef.current?.bracket(),
          // P2P hooks — broadcast consumption + contact sounds; resolved
          // through netRef at fire time so a room swap never stale-sends
          ...(net
            ? {
                startX: slot?.x ?? 0,
                startPos: slot?.pos ?? 0,
                onTakeCan: (i: number) => netRef.current?.sendTake(i),
                onHoleHit: (i: number) => netRef.current?.sendHole(i),
                onBump: (i: number) => audioRef.current?.bump(i),
              }
            : {}),
          debug: process.env.NODE_ENV !== "production",
        });
        setView(engineRef.current.state.view);
        // CPU ghost bots: EVERY client flags them as pass-through ghosts
        // with name tags on the fresh engine; the LEADER additionally
        // creates the simulation here (per race — a rematch re-rolls the
        // calibration from the new seed) and places the bots on the grid
        // slots right after the humans. The sim is fed in the frame loop
        // and streamed on the 50 ms net interval below
        botsSimRef.current = null;
        if (net && botsRef.current.length > 0) {
          attachBots(botsRef.current);
          if (isLeaderRef.current) {
            const sim = createBots(botsRef.current.length, seed);
            const grid =
              RACE_GRID[
                Math.min(Math.max(totalRacers, 1), RACE_GRID.length) - 1
              ];
            sim.forEach((b, i) => {
              const gs = grid[roster.length + i];
              b.pos = gs?.pos ?? 0;
              b.x = gs?.x ?? 0;
            });
            botsSimRef.current = sim;
          }
        }
        // a record-chase fetch that landed before the engine booted
        if (recordTargetsRef.current.length > 0) {
          engineRef.current.setRecordTargets(recordTargetsRef.current);
        }
        // dev-only handle for e2e probes (speed, gear, …)
        if (process.env.NODE_ENV !== "production") {
          (window as unknown as { __twingo?: RacerEngine }).__twingo =
            engineRef.current;
          (
            window as unknown as { __twingoBots?: () => Bot[] | null }
          ).__twingoBots = () => botsSimRef.current;
        }
      } else {
        // orientation flipped mid-run: keep the run, re-fit the renderer
        engineRef.current.resize(buf.w, buf.h);
      }
      raf = requestAnimationFrame(frame);
    })();

    /* VS race: stream our car state to the room at 20 Hz — 50 ms spacing
       keeps 2-3 packets inside the remote's ~120 ms interpolation window
       (see remotes.ts) despite DataChannel arrival jitter. Solo runs have
       no net — one null check per tick, zero behaviour change. After the
       local death the `dead` message (sent once in the frame loop) is the
       final word, so OUR stream stops there. The leader's CPU bots keep
       streaming regardless (immortal — dead humans spectate them): each
       snapshot goes to the room AND straight into the leader's own
       engine — no network loopback, so a solo room with bots works too */
    const netSend = window.setInterval(() => {
      const net = netRef.current;
      const e = engineRef.current;
      if (!net || !e) return;
      if (!gameOverRef.current) {
        net.sendState({
          pos: e.state.position,
          x: e.state.playerX,
          speed: e.state.speed,
          score: Math.floor(e.state.score),
          dead: false,
          steer: steerOutRef.current,
        });
      }
      const sim = botsSimRef.current;
      if (sim) {
        for (const b of botStates(sim)) {
          e.setRemoteState(b.id, b.state);
          e.setRemoteName(b.id, b.name);
          net.sendBotState(b.id, b.name, b.state);
          // the leader's own onBotState never fires (no loopback): mirror
          // the standings bookkeeping here too, or the leader's HUD /
          // spectate / race-over check never see the bots
          standingsRef.current.set(b.id, {
            name: b.name,
            state: b.state,
            dead: false,
            deadScore: 0,
          });
        }
        // keep the camera riding a spectated bot (the receivers get this
        // from onBotState; the leader must do it itself)
        const spec = spectatingRef.current;
        if (spec && isBotId(spec.id)) {
          const b = sim.find((x) => x.id === spec.id);
          if (b)
            e.setSpectate({ id: b.id, pos: b.pos, x: b.x, speed: b.speed });
        }
      }
    }, 50);

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
        // spectate back to the game-over panel → game over back to the
        // title → (during a run) open the pause menu. A pad's B/Start
        // lands here as a synthetic Escape, so B exits spectate too
        if (pauseSettingsOpenRef.current) setPauseSettingsOpen(false);
        else if (pauseMenuRef.current) resumeFromPause();
        else if (spectatingRef.current) exitSpectate();
        else if (gameOverRef.current) quitToTitle();
        else openPauseMenu();
        return;
      }
      // spectate mode: ←/→ (keyboard or pad d-pad synthetic keys) cycle
      // the camera between alive peers; every other key is swallowed —
      // the run is over (the engine ignores input), and the game-over
      // nav must not fire PLAY AGAIN/QUIT from under the camera
      if (spectatingRef.current) {
        if (down && (k === "arrowleft" || k === "arrowright")) {
          ev.preventDefault();
          cycleSpectate(k === "arrowright" ? 1 : -1);
        }
        return;
      }
      // game over: ←/→ (or ↑/↓) arms the action buttons, Enter/Space runs
      // the armed one — this is also the gamepad path, whose d-pad + A
      // land here as synthetic keys once the initials spinner has
      // released them. While the initials form is pending it owns Enter
      // and the arrows (input focus / spinner routing). In a VS race the
      // options come from goOptions(): SPECTATE while peers live, REMATCH
      // (leader) on the results screen, QUIT always
      if (gameOverRef.current && !goFormPendingRef.current) {
        if (!down) return;
        if (
          k === "arrowleft" ||
          k === "arrowright" ||
          k === "arrowup" ||
          k === "arrowdown"
        ) {
          ev.preventDefault();
          audioRef.current?.menuMove();
          const opts = goOptions();
          setGoSel((s) => {
            const i = opts.indexOf(s);
            return opts[(Math.max(i, 0) + 1) % opts.length];
          });
          return;
        }
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          const opts = goOptions();
          const sel = opts.includes(goSelRef.current)
            ? goSelRef.current
            : opts[0];
          if (sel === "spectate") {
            enterSpectate();
            return;
          }
          audioRef.current?.menuSelect();
          if (sel === "again") {
            // VS results screen: "again" is the REMATCH button — solo
            // PLAY AGAIN keeps its exact old behaviour
            if (netRef.current) requestRematch();
            else playAgain();
          } else quitToTitle();
          return;
        }
        // R / pad Select stays a PLAY AGAIN shortcut on game over (solo —
        // a VS race restarts only through the leader's REMATCH)
        if ((k === "r" || ev.code === "KeyR") && !netRef.current) {
          playAgain();
          return;
        }
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
      window.clearInterval(netSend);
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

  /* a fresh run token exists and the score would crack the top-10
     (or the board isn't full / hasn't loaded yet) → offer the form.
     Gated on gameOver: without that, a valid token + a STALE finalScore
     from the previous run + a small board made this true MID-RUN — the
     spinner then owned every pad edge while driving (mystery menu beeps)
     and a Start/A press submitted the stale score as AAA (the duplicate-
     score bug) */
  const qualifies =
    gameOver &&
    // the token is consumed client-side the moment a submit starts —
    // "sending" keeps the form (and the pad's spinner routing) alive
    // until the server answers, so an impatient A can't fire PLAY AGAIN
    // through the game-over nav while the submit is in flight
    (tokenRef.current !== null || submitState === "sending") &&
    finalScore > 0 &&
    // qualification runs against ALL four period windows (fetched at
    // game over), not the visible tab — cracking ANY top-10 earns the
    // initials form; a failed/absent fetch stays optimistic, the server
    // plausibility checks are the real gate anyway
    (qualifyBoards == null ||
      Object.values(qualifyBoards).some(
        (b) => b.length < 10 || finalScore > (b[b.length - 1]?.score ?? 0),
      ));
  goFormPendingRef.current = qualifies && submitState !== "done";

  /* arcade initials spinner (gamepad only — the classic joystick entry):
     up/down cycles A-Z0-9 on the armed slot, left/right moves slots,
     A locks the letter and advances (from the last slot it sends the
     score), B steps back a slot, Start sends. It drives the SAME
     `initials` state as the text input, so the submit path (and its
     profanity/plausibility checks) is untouched */
  const spinnerOn = padConnected && qualifies && submitState !== "done";
  const [spinSlot, setSpinSlot] = useState(0);
  useEffect(() => {
    spinActiveRef.current = spinnerOn;
    return () => {
      spinActiveRef.current = false;
    };
  }, [spinnerOn]);
  useEffect(() => {
    if (spinnerOn) {
      setInitials((s) => s.padEnd(3, "A").slice(0, 3));
      setSpinSlot(0);
    }
  }, [spinnerOn]);
  useEffect(() => {
    if (!spinnerOn) return;
    const onSpin = (ev: Event) => {
      const a = (ev as CustomEvent<string>).detail;
      if (a === "submit" || (a === "confirm" && spinSlot === 2)) {
        audioRef.current?.menuSelect();
        submitScore();
        return;
      }
      if (a === "confirm") {
        audioRef.current?.menuSelect();
        setSpinSlot(spinSlot + 1);
        return;
      }
      if (a === "back") {
        setSpinSlot(Math.max(0, spinSlot - 1));
        return;
      }
      if (a === "left" || a === "right") {
        audioRef.current?.menuMove();
        setSpinSlot(
          Math.max(0, Math.min(2, spinSlot + (a === "right" ? 1 : -1))),
        );
        return;
      }
      // up/down cycle the armed slot's letter (up walks A→Z, wrap-around)
      audioRef.current?.menuMove();
      setInitials((s) => {
        const cur = s.padEnd(3, "A").slice(0, 3);
        const i = SPIN_CHARS.indexOf(cur[spinSlot]);
        const n = SPIN_CHARS.length;
        const next = SPIN_CHARS[(i + (a === "up" ? 1 : n - 1) + n) % n];
        return cur.slice(0, spinSlot) + next + cur.slice(spinSlot + 1);
      });
    };
    window.addEventListener("twingo:spin", onSpin);
    return () => window.removeEventListener("twingo:spin", onSpin);
  }, [spinnerOn, spinSlot, submitScore]);

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
      <div className="racer-pausemenu-hint">
        {padConnected ? "D-PAD ROW / ADJUST" : "↑↓ ROW ◀▶ ADJUST"}
      </div>
    </div>
  );

  /* period tabs shared by the title leaderboard panel and the game-over
     overlay: all-time plus TR-day-aligned 30d / 7d / 24h boards. LB/RB
     on a gamepad cycles them (twingo:board-step) */
  const boardTabs = (
    <>
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
      {padConnected && (
        <div className="racer-pausemenu-hint">LB · RB — TABS</div>
      )}
    </>
  );

  /* lobby armed-row bookkeeping: lobbyRowIds is the single source shared
     with the key handler; sel stays clamped when the roster change drops
     the leader-only START RACE row from under the cursor */
  const lobbyRows = lobbyRowIds(lobbyView, isLeader);
  const lobbyAt = (id: string) => lobbyRows.indexOf(id);
  const sel = Math.min(lobbySel, lobbyRows.length - 1);

  /* the NAME row: part of the lobby row nav on the home and room views —
     armed like the buttons (Enter focuses the input, ESC inside blurs
     back to the nav). Edits persist immediately and re-hello through
     net.setName while a room is attached (debounced, flushed on
     blur/Enter/Escape) */
  const nameRow = (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard control lives on the window-level lobby handler — the row arms via ↑/↓ and focuses on Enter
    <div
      className={`racer-lobby-name-row${
        sel === lobbyAt("name") ? " racer-lobby-name-armed" : ""
      }`}
      onClick={() => nameInputRef.current?.focus()}
      onPointerEnter={() => setLobbySel(lobbyAt("name"))}
    >
      <label className="racer-initials-label" htmlFor="racer-lobby-name">
        NAME
      </label>
      <input
        id="racer-lobby-name"
        ref={nameInputRef}
        className="racer-initials-input racer-lobby-input racer-lobby-name-input font-pixel"
        value={playerName}
        maxLength={10}
        autoComplete="off"
        spellCheck={false}
        placeholder="YOU"
        onChange={(e) => changeName(e.target.value)}
        onFocus={() => setLobbySel(lobbyAt("name"))}
        onBlur={flushName}
        onKeyDown={(e) => {
          // Enter / ESC commit and hand the keys back to the row nav
          if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            flushName();
            nameInputRef.current?.blur();
          }
          e.stopPropagation();
        }}
      />
    </div>
  );

  /* VS race render gates: mpActive = a room is attached (netRef isn't
     reactive, but selfPeerId is cleared by leaveNet, so it mirrors it);
     spectateAvail = at least one peer in the standings is still alive */
  const mpActive = selfPeerId !== "";
  const spectateAvail = standings.some((r) => !r.self && !r.dead);

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
      {screen === "lobby" ? (
        /* VS RACE lobby: replaces the title art inside the same overlay
           box, same panel language as the leaderboard */
        <div className="racer-lobby-screen">
          <div
            className="racer-gameover racer-title-panel racer-lobby font-pixel"
            role="dialog"
            aria-label="VS race lobby"
          >
            <div className="racer-gameover-title">VS RACE</div>

            {lobbyView === "home" && (
              <>
                <div className="racer-lobby-sub">
                  2-5 PLAYERS — FRESH TRACK EVERY RACE
                </div>
                {nameRow}
                <div className="racer-lobby-menu">
                  <button
                    type="button"
                    className={`racer-playagain font-pixel${
                      sel === lobbyAt("create") ? " racer-go-armed" : ""
                    }`}
                    onClick={() => {
                      audioRef.current?.menuSelect();
                      joinNet(makeRoomCode());
                    }}
                    onPointerEnter={() => setLobbySel(lobbyAt("create"))}
                  >
                    CREATE ROOM
                  </button>
                  <button
                    type="button"
                    className={`racer-quit font-pixel${
                      sel === lobbyAt("join") ? " racer-go-armed" : ""
                    }`}
                    onClick={() => {
                      audioRef.current?.menuSelect();
                      setLobbyView("join");
                    }}
                    onPointerEnter={() => setLobbySel(lobbyAt("join"))}
                  >
                    JOIN ROOM
                  </button>
                  <button
                    type="button"
                    className={`racer-quit font-pixel${
                      sel === lobbyAt("back") ? " racer-go-armed" : ""
                    }`}
                    onClick={() => {
                      audioRef.current?.menuSelect();
                      setScreen("title");
                    }}
                    onPointerEnter={() => setLobbySel(lobbyAt("back"))}
                  >
                    BACK
                  </button>
                </div>
              </>
            )}

            {lobbyView === "join" && (
              <>
                <label
                  className="racer-initials-label"
                  htmlFor="racer-join-code"
                >
                  ENTER ROOM CODE
                </label>
                <div className="racer-initials-row">
                  <input
                    id="racer-join-code"
                    className="racer-initials-input racer-lobby-input font-pixel"
                    value={joinCode}
                    maxLength={4}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="K7X2"
                    onChange={(e) =>
                      setJoinCode(
                        e.target.value.toUpperCase().replace(ROOM_FILTER, ""),
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && VALID_ROOM.test(joinCode)) {
                        audioRef.current?.menuSelect();
                        joinNet(joinCode);
                      } else if (e.key === "Escape") setLobbyView("home");
                      e.stopPropagation();
                    }}
                    ref={(el) => el?.focus()}
                  />
                  <button
                    type="button"
                    className="racer-initials-submit font-pixel"
                    disabled={!VALID_ROOM.test(joinCode)}
                    onClick={() => {
                      audioRef.current?.menuSelect();
                      joinNet(joinCode);
                    }}
                  >
                    JOIN
                  </button>
                </div>
                <button
                  type="button"
                  className="racer-quit font-pixel"
                  onClick={() => {
                    audioRef.current?.menuSelect();
                    setLobbyView("home");
                  }}
                >
                  BACK
                </button>
              </>
            )}

            {lobbyView === "room" && (
              <>
                <div className="racer-lobby-code-label">ROOM CODE</div>
                <div className="racer-lobby-code">{roomCode}</div>
                {nameRow}
                {/* roster: onPeersChanged delivers it sorted by joinedAt —
                    index 0 is the lobby leader (» marker), self is (YOU) */}
                <ol className="racer-lobby-list">
                  {peers.map((p, i) => (
                    <li
                      key={p.id}
                      className={p.id === selfPeerId ? "racer-lobby-me" : ""}
                    >
                      <span className="racer-lobby-name">
                        {i === 0 ? "» " : ""}
                        {p.name}
                        {p.id === selfPeerId ? " (YOU)" : ""}
                      </span>
                      <span className="racer-lobby-dots" aria-hidden="true" />
                      <span
                        className={`racer-lobby-status${
                          p.ready ? " racer-lobby-status-ready" : ""
                        }`}
                      >
                        {p.ready ? "READY" : "NOT READY"}
                      </span>
                    </li>
                  ))}
                  {/* CPU ghost bots: after the humans (their grid slots
                      too), always READY — the leader simulates them */}
                  {bots.map((b) => (
                    <li key={b.id}>
                      <span className="racer-lobby-name">
                        {b.name} <span className="racer-bot-tag">BOT</span>
                      </span>
                      <span className="racer-lobby-dots" aria-hidden="true" />
                      <span className="racer-lobby-status racer-lobby-status-ready">
                        READY
                      </span>
                    </li>
                  ))}
                </ol>
                {peers.length < 2 && (
                  <div className="racer-lobby-sub">WAITING FOR RACERS…</div>
                )}
                <div className="racer-lobby-menu">
                  <button
                    type="button"
                    className={`racer-quit font-pixel${
                      myReady ? " racer-lobby-ready-on" : ""
                    }${sel === lobbyAt("ready") ? " racer-go-armed" : ""}`}
                    onClick={() => {
                      audioRef.current?.menuSelect();
                      netRef.current?.setReady(!myReady);
                    }}
                    onPointerEnter={() => setLobbySel(lobbyAt("ready"))}
                  >
                    {myReady ? "READY!" : "READY?"}
                  </button>
                  <button
                    type="button"
                    className={`racer-quit font-pixel${
                      sel === lobbyAt("copy") ? " racer-go-armed" : ""
                    }`}
                    onClick={copyRaceLink}
                    onPointerEnter={() => setLobbySel(lobbyAt("copy"))}
                  >
                    {copied ? "COPIED!" : "COPY LINK"}
                  </button>
                  {isLeader && (
                    <button
                      type="button"
                      className={`racer-quit font-pixel${
                        sel === lobbyAt("addbot") ? " racer-go-armed" : ""
                      }`}
                      disabled={!canAddBot}
                      onClick={addBot}
                      onPointerEnter={() => setLobbySel(lobbyAt("addbot"))}
                    >
                      ADD BOT
                    </button>
                  )}
                  {isLeader && (
                    <button
                      type="button"
                      className={`racer-quit font-pixel${
                        sel === lobbyAt("removebot") ? " racer-go-armed" : ""
                      }`}
                      disabled={bots.length === 0}
                      onClick={removeBot}
                      onPointerEnter={() => setLobbySel(lobbyAt("removebot"))}
                    >
                      REMOVE BOT
                    </button>
                  )}
                  {isLeader && (
                    <button
                      type="button"
                      className={`racer-playagain font-pixel${
                        sel === lobbyAt("start") ? " racer-go-armed" : ""
                      }`}
                      disabled={!canStart}
                      onClick={() => {
                        if (!canStart) return;
                        audioRef.current?.menuSelect();
                        netRef.current?.startRace(newSeed());
                      }}
                      onPointerEnter={() => setLobbySel(lobbyAt("start"))}
                    >
                      START RACE
                    </button>
                  )}
                  <button
                    type="button"
                    className={`racer-quit font-pixel${
                      sel === lobbyAt("leave") ? " racer-go-armed" : ""
                    }`}
                    onClick={() => {
                      audioRef.current?.menuSelect();
                      leaveNet();
                      setLobbyView("home");
                      setScreen("title");
                    }}
                    onPointerEnter={() => setLobbySel(lobbyAt("leave"))}
                  >
                    LEAVE
                  </button>
                </div>
                {!isLeader && (
                  <div className="racer-pausemenu-hint">
                    LEADER STARTS THE RACE
                  </div>
                )}
                {connectStuck && !netConnected && (
                  <div className="racer-lobby-retry">
                    CONNECTING…
                    <button
                      type="button"
                      className="racer-quit font-pixel"
                      onClick={() => joinNet(roomCode)}
                    >
                      RETRY
                    </button>
                  </div>
                )}
              </>
            )}

            {lobbyView === "full" && (
              <>
                <div className="racer-gameover-score">
                  ROOM FULL — MAX {MAX_RACERS} RACERS
                </div>
                <button
                  type="button"
                  className="racer-playagain font-pixel"
                  onClick={() => {
                    audioRef.current?.menuSelect();
                    setLobbyView("home");
                    setScreen("title");
                  }}
                  ref={(el) => el?.focus()}
                >
                  BACK
                </button>
              </>
            )}

            <div className="racer-pausemenu-hint">
              {lobbyView === "join"
                ? "TYPE CODE · ENTER JOIN · ESC BACK"
                : padConnected
                  ? "D-PAD SELECT · A OK · B BACK"
                  : "↑↓ SELECT · ENTER OK · ESC BACK"}
            </div>
          </div>
        </div>
      ) : screen === "title" ? (
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
          {/* VS RACE: P2P multiplayer lobby — a DOM chip like SETTINGS
              (the artwork's painted buttons can't grow a sibling), parked
              under it in the top-right sky corner */}
          <button
            type="button"
            className={`racer-title-race font-pixel${
              titleSel === "race" ? " racer-title-race-sel" : ""
            }`}
            onClick={openLobby}
            onPointerEnter={() => setTitleSel("race")}
            ref={(el) => {
              if (titleSel === "race" && !titleBoard && !titleSettingsOpen)
                el?.focus();
            }}
          >
            VS RACE
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

      {/* VS race countdown ON THE TRACK: the engine is already booted
          and idling on the grid behind this overlay (input suppressed).
          The numbers count down from the start message's receipt — each
          client on its own clock, no sync needed — and GO holds until
          the engine ref exists */}
      {pendingRace !== null && (
        <div className="racer-countdown font-pixel" role="status">
          {countRemain > 0 ? Math.min(3, Math.ceil(countRemain / 1000)) : "GO!"}
        </div>
      )}
      {intro && pendingRace === null && (
        <div className="racer-ready font-pixel" aria-hidden="true">
          READY...
        </div>
      )}
      {paused && !pauseMenu && (
        <div className="racer-paused font-pixel" role="status">
          {padConnected
            ? "PAUSED — PRESS START"
            : coarse
              ? "PAUSED — TAP TO RESUME"
              : "PAUSED — CLICK TO RESUME"}
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
          {!coarse && (
            <div className="racer-pausemenu-hint">
              {padConnected ? "A SELECT — B RESUME" : "ESC — RESUME"}
            </div>
          )}
        </div>
      )}
      {/* VS race results: once EVERY participant is dead the game-over
          panel is replaced by the final standings — REMATCH (leader only)
          starts a fresh countdown in the same room, others wait */}
      {gameOver && screen === "playing" && !spectating && raceResults && (
        <div className="racer-gameover font-pixel" role="alert">
          <div className="racer-gameover-title">RESULTS</div>
          <div className="racer-gameover-score">
            {raceResults.winners.length > 1 ? "WINNERS: " : "WINNER: "}
            {raceResults.winners.join(" · ")}
          </div>
          <ol className="racer-lobby-list racer-results">
            {raceResults.rows.map((r, i) => (
              <li key={r.id} className={r.self ? "racer-lobby-me" : ""}>
                <span className="racer-lobby-name">
                  {String(i + 1).padStart(2, "0")}. {r.name}
                  {r.self ? " (YOU)" : ""}
                  {r.bot && <span className="racer-bot-tag">BOT</span>}
                </span>
                <span className="racer-lobby-dots" aria-hidden="true" />
                <span>{r.score}</span>
              </li>
            ))}
          </ol>
          <div className="racer-gameover-actions">
            {isLeader ? (
              <button
                type="button"
                className={`racer-playagain font-pixel${
                  goSel === "again" ? " racer-go-armed" : ""
                }`}
                disabled={pendingRace !== null}
                onClick={requestRematch}
                ref={(el) => el?.focus()}
              >
                {pendingRace !== null ? "STARTING…" : "REMATCH"}
              </button>
            ) : (
              <div className="racer-pausemenu-hint">
                {pendingRace !== null ? "STARTING…" : "WAITING FOR REMATCH…"}
              </div>
            )}
            <button
              type="button"
              className={`racer-quit font-pixel${
                goSel === "quit" ? " racer-go-armed" : ""
              }`}
              onClick={quitToTitle}
              ref={(el) => {
                if (!isLeader) el?.focus();
              }}
            >
              QUIT
            </button>
          </div>
          {!coarse && (
            <div className="racer-pausemenu-hint">
              {padConnected
                ? "◀ ▶ SELECT · A OK · B QUIT"
                : "← → SELECT · ENTER OK · ESC QUIT"}
            </div>
          )}
        </div>
      )}
      {gameOver && screen === "playing" && !spectating && !raceResults && (
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
              {spinnerOn ? (
                <div className="racer-initials-label">
                  NEW HIGHSCORE — ENTER INITIALS
                </div>
              ) : (
                <label
                  className="racer-initials-label"
                  htmlFor="racer-initials"
                >
                  NEW HIGHSCORE — ENTER INITIALS
                </label>
              )}
              {spinnerOn ? (
                <>
                  <div className="racer-spinner font-pixel">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className={`racer-spinner-slot${
                          i === spinSlot ? " racer-spinner-slot-sel" : ""
                        }`}
                      >
                        <span className="racer-spinner-arrow">▲</span>
                        <span className="racer-spinner-ch">
                          {initials.padEnd(3, "A")[i]}
                        </span>
                        <span className="racer-spinner-arrow">▼</span>
                      </div>
                    ))}
                  </div>
                  <div className="racer-pausemenu-hint">
                    ↑↓ LETTER · ←→ SLOT · A OK · START SEND
                  </div>
                </>
              ) : (
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
                    disabled={
                      initials.length !== 3 || submitState === "sending"
                    }
                    onClick={submitScore}
                  >
                    {submitState === "sending" ? "..." : "SUBMIT"}
                  </button>
                </div>
              )}
            </div>
          )}
          {submitState === "error" && (
            <div className="racer-initials-error">SAVE FAILED</div>
          )}

          <div className="racer-gameover-actions">
            {/* VS race, peers still racing: no solo PLAY AGAIN — watch the
                survivor instead (results + REMATCH arrive once everyone is
                dead). Solo keeps PLAY AGAIN byte-identical */}
            {mpActive && spectateAvail && (
              <button
                type="button"
                className={`racer-playagain font-pixel${
                  goSel === "spectate" ? " racer-go-armed" : ""
                }`}
                onClick={enterSpectate}
                ref={(el) => {
                  if (!qualifies || submitState === "done") el?.focus();
                }}
              >
                SPECTATE
              </button>
            )}
            {!mpActive && (
              <button
                type="button"
                className={`racer-playagain font-pixel${
                  goSel === "again" ? " racer-go-armed" : ""
                }`}
                onClick={playAgain}
                ref={(el) => {
                  if (!qualifies || submitState === "done") el?.focus();
                }}
              >
                PLAY AGAIN
              </button>
            )}
            <button
              type="button"
              className={`racer-quit font-pixel${
                goSel === "quit" ? " racer-go-armed" : ""
              }`}
              onClick={quitToTitle}
              ref={(el) => {
                if (
                  mpActive &&
                  !spectateAvail &&
                  (!qualifies || submitState === "done")
                )
                  el?.focus();
              }}
            >
              QUIT
            </button>
          </div>
          {mpActive && (
            <div className="racer-pausemenu-hint">
              {spectateAvail
                ? "RACE STILL ON — RESULTS WHEN ALL ARE OUT"
                : "WAITING FOR THE ROOM…"}
            </div>
          )}
          {!coarse && (
            <div className="racer-pausemenu-hint">
              {padConnected
                ? "◀ ▶ SELECT · A OK · B QUIT"
                : "← → SELECT · ENTER OK · ESC QUIT"}
            </div>
          )}
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

      {/* VS race standings: top-right, parked under the ✕/touch top bar.
          Rows refresh at 4 Hz from standingsRef (see the ticker effect);
          self in amber, dead peers dimmed with their score swapped for
          OUT, the current leader marked » like the lobby roster */}
      {screen === "playing" && standings.length > 0 && (
        <div
          className="racer-standings font-pixel"
          role="status"
          aria-label="Standings"
        >
          {standings.map((r, i) => (
            <div
              key={r.id}
              className={`racer-standings-row${
                r.self ? " racer-standings-me" : ""
              }${r.dead ? " racer-standings-dead" : ""}`}
            >
              <span className="racer-standings-name">
                {i === 0 ? "» " : ""}
                {r.name}
                {r.bot && <span className="racer-bot-tag">BOT</span>}
              </span>
              <span className="racer-standings-score">
                {r.dead ? "OUT" : r.score}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* spectate mode: the game-over panel hides behind the camera ride;
          ESC / pad B drops back to it. With 2+ peers alive ←/→, pad LB/RB
          or a tap on the chip cycles the camera between them */}
      {spectating &&
        (() => {
          const canSwitch =
            standings.filter((r) => !r.self && !r.dead).length >= 2;
          return (
            // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard control lives on the window-level handler — ←/→ cycle the camera while spectating
            <div
              className="racer-spectate font-pixel"
              role="status"
              onClick={canSwitch ? () => cycleSpectate(1) : undefined}
            >
              SPECTATING {spectating.name}
              {canSwitch &&
                (padConnected ? " — LB/RB SWITCH" : " — ←/→ SWITCH")}{" "}
              — {padConnected ? "B" : "ESC"} EXIT
            </div>
          );
        })()}

      {/* FPS counter — toggled with F */}
      {screen === "playing" && showFps && (
        <div className="racer-fps font-pixel" aria-hidden="true">
          {fps} FPS
        </div>
      )}

      {/* key legend — desktop only, hidden once the run is over. With a
          gamepad connected the pad's own buttons take over the legend
          (the keyboard keeps working, it just stops being the hint) */}
      {screen === "playing" && !coarse && !gameOver && (
        <div className="racer-keys font-pixel" aria-hidden="true">
          {padConnected ? (
            <>
              <div className="racer-keys-row">
                <span className="racer-key">RT</span> GAS
              </div>
              <div className="racer-keys-row">
                <span className="racer-key">LT</span> BRAKE
              </div>
              <div className="racer-keys-row">
                <span className="racer-key">LS</span> STEER
              </div>
              {cockpitReady && (
                <div className="racer-keys-row">
                  <span className="racer-key">Y</span> CAMERA
                </div>
              )}
              <div className="racer-keys-row">
                <span className="racer-key">SEL</span> RESTART
              </div>
              <div className="racer-keys-row">
                <span className="racer-key">START</span> MENU
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
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
