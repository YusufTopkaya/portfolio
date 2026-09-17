/* Gamepad support (Xbox / PlayStation / no-name USB pads): the browser
   remaps every known controller to the STANDARD layout, so fixed indices
   cover them all — left stick / d-pad steer, RT gas, LT brake, A confirm,
   B back, Start menu, Y camera, Select restart. Browsers only expose a
   pad after its first button press (the gamepadconnected event fires
   then), so a freshly connected pad shows up on its first touch.
   Polled once per frame from TwingoRacer: continuous state (steer/gas/
   brake) is merged into the engine's input bag, edge presses are turned
   into synthetic keyboard events so every menu keeps its existing key
   handlers untouched. */

export type PadAction =
  | "up"
  | "down"
  | "confirm"
  | "back"
  | "pause"
  | "camera"
  | "restart";

export interface PadState {
  /** analog steering -1..1 (left stick X, d-pad as ±1); null = centred */
  steer: number | null;
  gas: boolean;
  brake: boolean;
  /** actions whose button went down since the previous poll */
  pressed: Set<PadAction>;
}

const DEADZONE = 0.15;
const STICK_MENU_STEP = 0.6; // left-stick Y also steps through menus

// standard-mapping button indices
const BTN_A = 0;
const BTN_B = 1;
const BTN_Y = 3;
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
let prev = { a: false, b: false, y: false, sel: false, start: false };
let prevMenuAxis = 0; // -1 / 0 / 1

const applyDeadzone = (v: number): number => {
  if (Math.abs(v) < DEADZONE) return 0;
  const s = Math.sign(v);
  return s * Math.min(1, (Math.abs(v) - DEADZONE) / (1 - DEADZONE));
};

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
    prev = { a: false, b: false, y: false, sel: false, start: false };
    prevMenuAxis = 0;
    return null;
  }
  const b = (i: number) => pad.buttons[i];
  const held = (i: number) => {
    const btn = b(i);
    return !!btn && (btn.pressed || btn.value > 0.3);
  };

  const stickX = applyDeadzone(pad.axes[0] ?? 0);
  const steer =
    stickX !== 0 ? stickX : held(BTN_DLEFT) ? -1 : held(BTN_DRIGHT) ? 1 : null;

  const pressed = new Set<PadAction>();
  const edge = (key: keyof typeof prev, down: boolean, action: PadAction) => {
    if (down && !prev[key]) pressed.add(action);
    prev[key] = down;
  };
  edge("a", held(BTN_A), "confirm");
  edge("b", held(BTN_B), "back");
  edge("y", held(BTN_Y), "camera");
  edge("sel", held(BTN_SELECT), "restart");
  edge("start", held(BTN_START), "pause");
  // menu steps (d-pad up/down + left stick Y) fire once per press — a
  // held direction must not machine-gun the menus
  const stickY = pad.axes[1] ?? 0;
  const menuAxis =
    stickY < -STICK_MENU_STEP || held(BTN_DUP)
      ? -1
      : stickY > STICK_MENU_STEP || held(BTN_DDOWN)
        ? 1
        : 0;
  if (menuAxis === -1 && prevMenuAxis !== -1) pressed.add("up");
  if (menuAxis === 1 && prevMenuAxis !== 1) pressed.add("down");
  prevMenuAxis = menuAxis;

  return {
    steer,
    gas: held(BTN_RT),
    brake: held(BTN_LT),
    pressed,
  };
}
