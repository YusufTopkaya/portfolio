/* Gamepad support (Xbox / PlayStation / no-name USB pads): the browser
   remaps every known controller to the STANDARD layout, so fixed indices
   cover them all — left stick / d-pad steer, RT gas, LT brake, A confirm,
   B back, Start menu, Y camera, Select restart, LB/RB step the
   leaderboard tabs. Gas and brake come ONLY from the analog triggers —
   no stick-pedal substitutes: a drifting stick axis would latch the
   brake on. The triggers are ANALOG with their own 0.08 deadzone (resting
   LT noise must never light the stop lamps): gasAmt/brakeAmt carry the
   raw 0..1 pull so a half-squeezed RT is a half throttle. Pads without
   trigger buttons simply can't drive — accepted limitation.
   On NON-standard pads (mapping !== "standard") the d-pad often isn't
   buttons 12-15: Firefox exposes it as a hat on axes[9] (eighth-step
   encoding, neutral ≈ 3.29), some DirectInput pads as axes 6/7 — both
   are used as fallbacks so menus stay navigable.
   Browsers only expose a pad after its first button press (the
   gamepadconnected event fires then), so a freshly connected pad shows
   up on its first touch.
   Polled once per frame from TwingoRacer: continuous state (steer/gas/
   brake) is merged into the engine's input bag, edge presses are turned
   into synthetic keyboard events so every menu keeps its existing key
   handlers untouched. */

export type PadAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "confirm"
  | "back"
  | "pause"
  | "camera"
  | "restart"
  | "tabLeft"
  | "tabRight";

export interface PadState {
  /** analog steering -1..1 (left stick X, d-pad as ±1); null = centred */
  steer: number | null;
  /** raw trigger pull 0..1 (RT) — 0.5 is a genuine half throttle */
  gasAmt: number;
  /** raw trigger pull 0..1 (LT) */
  brakeAmt: number;
  /** currently held menu direction (-1/0/1) — the initials spinner uses
      these for arcade-style hold-to-scroll auto-repeat */
  menuX: number;
  menuY: number;
  /** actions whose button went down since the previous poll */
  pressed: Set<PadAction>;
}

const DEADZONE = 0.15;
const TRIGGER_DEADZONE = 0.08; // resting LT/RT noise must not latch a pedal
const STICK_MENU_STEP = 0.6; // left-stick Y also steps through menus

// standard-mapping button indices
const BTN_A = 0;
const BTN_B = 1;
const BTN_Y = 3;
const BTN_LB = 4;
const BTN_RB = 5;
const BTN_LT = 6;
const BTN_RT = 7;
const BTN_SELECT = 8;
const BTN_START = 9;
const BTN_DUP = 12;
const BTN_DDOWN = 13;
const BTN_DLEFT = 14;
const BTN_DRIGHT = 15;

// previous-frame snapshot for edge detection (module-level: the pad is a
// singleton for our purposes — the first connected pad is THE pad)
let prev = {
  a: false,
  b: false,
  y: false,
  lb: false,
  rb: false,
  sel: false,
  start: false,
};
let prevMenuAxisY = 0; // -1 / 0 / 1
let prevMenuAxisX = 0;

const applyDeadzone = (v: number): number => {
  if (Math.abs(v) < DEADZONE) return 0;
  const s = Math.sign(v);
  return s * Math.min(1, (Math.abs(v) - DEADZONE) / (1 - DEADZONE));
};

/* d-pad direction as -1/0/1 per axis. Standard pads expose it as buttons
   12-15; non-standard pads (older Firefox / DirectInput-style) as a hat
   axis (axes[9]: up=-1, then clockwise in 2/7 steps, neutral ≈ 3.29) or
   plain axes 6/7 */
function dpadAxes(pad: Gamepad): { x: number; y: number } {
  const held = (i: number) => {
    const btn = pad.buttons[i];
    return !!btn && (btn.pressed || btn.value > 0.3);
  };
  if (pad.mapping === "standard" || pad.buttons.length > BTN_DRIGHT) {
    return {
      x: held(BTN_DRIGHT) ? 1 : held(BTN_DLEFT) ? -1 : 0,
      y: held(BTN_DDOWN) ? 1 : held(BTN_DUP) ? -1 : 0,
    };
  }
  const hat = pad.axes[9];
  if (hat !== undefined && hat <= 1.05 && Math.abs(hat) >= 0.05) {
    // 8-way ring starting at up=-1, clockwise in 2/7 steps
    const dirs: [number, number][] = [
      [0, -1], // up
      [1, -1],
      [1, 0], // right
      [1, 1],
      [0, 1], // down
      [-1, 1],
      [-1, 0], // left
      [-1, -1],
    ];
    const idx = Math.round(((hat + 1) / 2) * 7);
    const d = dirs[Math.max(0, Math.min(7, idx))];
    return { x: d[0], y: d[1] };
  }
  const ax = pad.axes[6] ?? 0;
  const ay = pad.axes[7] ?? 0;
  return {
    x: Math.abs(ax) > 0.5 ? Math.sign(ax) : 0,
    y: Math.abs(ay) > 0.5 ? Math.sign(ay) : 0,
  };
}

/** first connected gamepad, or null. Never throws on older browsers. */
export function currentPad(): Gamepad | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  for (const p of navigator.getGamepads()) if (p?.connected) return p;
  return null;
}

/** poll the pad once; null when no pad is connected */
export function pollPad(): PadState | null {
  const pad = currentPad();
  if (!pad) {
    prev = {
      a: false,
      b: false,
      y: false,
      lb: false,
      rb: false,
      sel: false,
      start: false,
    };
    prevMenuAxisY = 0;
    prevMenuAxisX = 0;
    return null;
  }
  const b = (i: number) => pad.buttons[i];
  const held = (i: number) => {
    const btn = b(i);
    return !!btn && (btn.pressed || btn.value > 0.3);
  };
  // analog trigger pull 0..1 with a resting-noise deadzone; a digital
  // trigger reports pressed instead
  const pull = (i: number) => {
    const btn = b(i);
    if (!btn) return 0;
    const v = Math.max(btn.value, btn.pressed ? 1 : 0);
    if (v < TRIGGER_DEADZONE) return 0;
    return Math.min(1, (v - TRIGGER_DEADZONE) / (1 - TRIGGER_DEADZONE));
  };
  const dpad = dpadAxes(pad);

  const stickX = applyDeadzone(pad.axes[0] ?? 0);
  const steer = stickX !== 0 ? stickX : dpad.x !== 0 ? dpad.x : null;

  const pressed = new Set<PadAction>();
  const edge = (key: keyof typeof prev, down: boolean, action: PadAction) => {
    if (down && !prev[key]) pressed.add(action);
    prev[key] = down;
  };
  edge("a", held(BTN_A), "confirm");
  edge("b", held(BTN_B), "back");
  edge("y", held(BTN_Y), "camera");
  edge("lb", held(BTN_LB), "tabLeft");
  edge("rb", held(BTN_RB), "tabRight");
  edge("sel", held(BTN_SELECT), "restart");
  edge("start", held(BTN_START), "pause");
  // menu steps (d-pad + left stick) fire once per press — a held
  // direction must not machine-gun the menus. The consumer suppresses
  // left/right while driving (they double as the keyboard steer keys)
  const stickY = pad.axes[1] ?? 0;
  const menuAxisY =
    stickY < -STICK_MENU_STEP || dpad.y === -1
      ? -1
      : stickY > STICK_MENU_STEP || dpad.y === 1
        ? 1
        : 0;
  if (menuAxisY === -1 && prevMenuAxisY !== -1) pressed.add("up");
  if (menuAxisY === 1 && prevMenuAxisY !== 1) pressed.add("down");
  prevMenuAxisY = menuAxisY;
  const menuAxisX =
    stickX < -0.5 || dpad.x === -1 ? -1 : stickX > 0.5 || dpad.x === 1 ? 1 : 0;
  if (menuAxisX === -1 && prevMenuAxisX !== -1) pressed.add("left");
  if (menuAxisX === 1 && prevMenuAxisX !== 1) pressed.add("right");
  prevMenuAxisX = menuAxisX;

  return {
    steer,
    gasAmt: pull(BTN_RT),
    brakeAmt: pull(BTN_LT),
    menuX: menuAxisX,
    menuY: menuAxisY,
    pressed,
  };
}
