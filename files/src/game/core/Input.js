/**
 * Input: keyboard + mouse (pointer lock) + gamepad, mapped to named actions.
 * Per-frame edge detection: pressed(action) / released(action) valid for one update.
 */
export const DEFAULT_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['KeyC', 'ControlLeft'],
  attack: ['Mouse0', 'KeyF'],
  place: ['Mouse2', 'KeyG'],
  interact: ['KeyE'],
  combat: ['Digit1'],
  mine: ['Digit2'],
  build: ['Digit3'],
  pause: ['Escape', 'KeyP'],
  respawn: ['KeyR'],
};
const PAD_MAP = {
  jump: 0,
  attack: 2,
  place: 5,
  interact: 3,
  sprint: 10,
  crouch: 1,
  pause: 9,
  combat: 12,
  mine: 14,
  build: 15,
  respawn: 8,
};

export class Input {
  constructor(el) {
    this.el = el;
    this.bindings = structuredClone(DEFAULT_BINDINGS);
    this.down = new Set();
    this.justDown = new Set();
    this.justUp = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.lockSettleUntil = 0;
    this.enabled = true;
    this.sensitivity = 1;
    this.invertY = false;
    this.padIndex = -1;
    this.padPrev = [];
    this.padAxes = [0, 0, 0, 0];
    this.usingPad = false;
    this.wantLock = false;
    this._bind();
  }

  _bind() {
    this._kd = (e) => {
      if (e.repeat) return;
      if (['Tab', 'Space', 'AltLeft', 'F3'].includes(e.code) && this.enabled) e.preventDefault();
      this.usingPad = false;
      this._press(e.code);
    };
    this._ku = (e) => this._release(e.code);
    this._md = (e) => {
      this.usingPad = false;
      // The click that captures the pointer must not also attack, mine or place.
      if (this.wantLock && !this.locked && this.el.requestPointerLock) return this.requestLock();
      this._press('Mouse' + e.button);
    };
    this._mu = (e) => this._release('Mouse' + e.button);
    this._mm = (e) => {
      if (!this.locked) return;
      const dx = e.movementX,
        dy = e.movementY;
      // Browsers (Chrome on macOS especially) report one bogus jump right after the pointer is
      // (re)locked — the distance from where the free cursor was to the lock point. Swallow it,
      // and any other single-event spike no hand could produce, so the camera never snaps.
      const settling = performance.now() < this.lockSettleUntil;
      if (
        (settling && (Math.abs(dx) > 40 || Math.abs(dy) > 40)) ||
        Math.abs(dx) > 600 ||
        Math.abs(dy) > 600
      )
        return;
      this.mouseDX += dx;
      this.mouseDY += dy;
    };
    this._wh = (e) => {
      this.wheel += Math.sign(e.deltaY);
    };
    this._plc = () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.el;
      if (this.locked && !was) {
        this.lockSettleUntil = performance.now() + 250;
        this.mouseDX = this.mouseDY = 0;
      }
    };
    this._blur = () => {
      for (const c of this.down) this.justUp.add(c);
      this.down.clear();
    };
    this._ctx = (e) => e.preventDefault();
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    this.el.addEventListener('mousedown', this._md);
    window.addEventListener('mouseup', this._mu);
    window.addEventListener('mousemove', this._mm);
    this.el.addEventListener('wheel', this._wh, { passive: true });
    this.el.addEventListener('contextmenu', this._ctx);
    document.addEventListener('pointerlockchange', this._plc);
    window.addEventListener('blur', this._blur);
    this._pad = (e) => {
      this.padIndex = e.gamepad.index;
    };
    window.addEventListener('gamepadconnected', this._pad);
  }

  dispose() {
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    this.el.removeEventListener('mousedown', this._md);
    window.removeEventListener('mouseup', this._mu);
    window.removeEventListener('mousemove', this._mm);
    this.el.removeEventListener('wheel', this._wh);
    this.el.removeEventListener('contextmenu', this._ctx);
    document.removeEventListener('pointerlockchange', this._plc);
    window.removeEventListener('blur', this._blur);
    window.removeEventListener('gamepadconnected', this._pad);
    this.releaseLock();
  }

  _press(code) {
    if (!this.down.has(code)) this.justDown.add(code);
    this.down.add(code);
  }
  _release(code) {
    if (this.down.has(code)) this.justUp.add(code);
    this.down.delete(code);
  }

  requestLock() {
    if (document.pointerLockElement !== this.el) {
      try {
        const p = this.el.requestPointerLock?.({ unadjustedMovement: false });
        p?.catch?.(() => {});
      } catch {
        /* ignore */
      }
    }
  }
  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Called at start of each frame, before game update. */
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = this.padIndex >= 0 ? pads[this.padIndex] : null;
    if (!pad)
      for (const p of pads)
        if (p) {
          pad = p;
          this.padIndex = p.index;
          break;
        }
    if (!pad) {
      for (let i = 0; i < this.padPrev.length; i++) this._release('Pad' + i);
      this.padPrev = [];
      this.padAxes = [0, 0, 0, 0];
    }
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      this.padAxes = [
        dz(pad.axes[0] || 0),
        dz(pad.axes[1] || 0),
        dz(pad.axes[2] || 0),
        dz(pad.axes[3] || 0),
      ];
      const btns = pad.buttons.map((b) => b.pressed);
      btns.forEach((b, i) => {
        const code = 'Pad' + i;
        if (b && !this.padPrev[i]) {
          this._press(code);
          this.usingPad = true;
        } else if (!b && this.padPrev[i]) this._release(code);
      });
      this.padPrev = btns;
      if (this.padAxes.some((a) => a !== 0)) this.usingPad = true;
    }
  }

  /** Called at end of frame to clear edge states. */
  endFrame() {
    this.justDown.clear();
    this.justUp.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  _codes(action) {
    const codes = this.bindings[action] || [];
    const pad = PAD_MAP[action];
    return pad != null ? [...codes, 'Pad' + pad] : codes;
  }
  held(action) {
    if (!this.enabled) return false;
    return this._codes(action).some((c) => this.down.has(c));
  }
  pressed(action) {
    if (!this.enabled) return false;
    return this._codes(action).some((c) => this.justDown.has(c));
  }
  released(action) {
    return this._codes(action).some((c) => this.justUp.has(c));
  }
  /** Pressed regardless of enabled flag (UI / cutscene skip). */
  pressedRaw(action) {
    return this._codes(action).some((c) => this.justDown.has(c));
  }
  heldRaw(action) {
    return this._codes(action).some((c) => this.down.has(c));
  }

  /** Movement vector in local space: x = right, y = forward. */
  moveAxis() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    let y = (this.held('forward') ? 1 : 0) - (this.held('back') ? 1 : 0);
    if (this.padAxes[0] || this.padAxes[1]) {
      x = this.padAxes[0];
      y = -this.padAxes[1];
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  /** Camera look delta in radians for this frame. */
  lookDelta(dt) {
    if (!this.enabled) return { x: 0, y: 0 };
    const s = 0.0022 * this.sensitivity;
    let x = this.mouseDX * s;
    let y = this.mouseDY * s;
    if (this.padAxes[2] || this.padAxes[3]) {
      x += this.padAxes[2] * 3.2 * dt * this.sensitivity;
      y += this.padAxes[3] * 2.4 * dt * this.sensitivity;
    }
    if (this.invertY) y = -y;
    return { x, y };
  }
}
