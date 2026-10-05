import * as THREE from 'three';
import { ease, clamp, lerp, damp } from '../core/math.js';

/**
 * Pose: { bone: [rx, ry, rz], rootY?, rootX?, rootZ? } (radians / model px). Missing bones = 0.
 * Keyframe clip: { dur, keys: [[t, pose, easeName?], ...], mask: 'full'|'upper'|'arms', hit?: [t0, t1], events?: {name: t}, loop? }
 */
const UPPER = new Set([
  'spine',
  'chest',
  'head',
  'armR',
  'foreR',
  'handR',
  'armL',
  'foreL',
  'handL',
]);
const ARMS = new Set(['armR', 'foreR', 'handR', 'armL', 'foreL', 'handL']);
const BODY_BONES = [
  'root',
  'hips',
  'spine',
  'chest',
  'head',
  'armR',
  'foreR',
  'handR',
  'armL',
  'foreL',
  'handL',
  'legR',
  'shinR',
  'legL',
  'shinL',
];

/* ------------------------------------------------------------------ */
/* Keyframed clips                                                     */
/* ------------------------------------------------------------------ */
export const CLIPS = {
  attack: {
    dur: 0.42,
    mask: 'upper',
    hit: [0.15, 0.23],
    keys: [
      [0, {}],
      [0.12, { chest: [0, -0.5, 0], armR: [-1.5, 0, -0.8], foreR: [-0.8, 0, 0] }, 'outQuad'],
      [0.22, { chest: [0.2, 0.5, 0], armR: [-0.9, 0, 0.5], foreR: [-0.1, 0, 0] }, 'outCubic'],
      [0.42, {}],
    ],
  },
  hurt: {
    dur: 0.3,
    mask: 'full',
    keys: [
      [0, {}],
      [0.08, { chest: [-0.35, 0, 0], head: [-0.2, 0, 0] }, 'outQuad'],
      [0.3, {}],
    ],
  },
  cheer: {
    dur: 1,
    mask: 'full',
    keys: [
      [0, {}],
      [0.25, { armR: [-3, 0, -0.3], armL: [-3, 0, 0.3], rootY: 3 }, 'outQuad'],
      [0.5, { armR: [-3, 0, -0.3], armL: [-3, 0, 0.3], rootY: 0 }],
      [1, {}],
    ],
  },
};

/* ------------------------------------------------------------------ */
/* Procedural locomotion                                               */
/* ------------------------------------------------------------------ */
function locomotion(t, phase, p, pose, combat) {
  const s = p.moveBlend; // 0 idle .. 1 walk .. 2 run .. 3 sprint
  for (const name in pose) {
    if (typeof pose[name] === 'number') pose[name] = 0;
    else pose[name].fill(0);
  }
  const add = (b, x, y = 0, z = 0, w = 1) => {
    const o = pose[b] || (pose[b] = [0, 0, 0]);
    o[0] += x * w;
    o[1] += y * w;
    o[2] += z * w;
  };
  let rootY = 0;
  // idle
  const wi = clamp(1 - s, 0, 1);
  if (wi > 0) {
    const br = Math.sin(t * 1.7);
    add('chest', 0.02 * br, 0, 0, wi);
    add('head', -0.02 * br + Math.sin(t * 0.37) * 0.04, Math.sin(t * 0.23) * 0.12, 0, wi);
    add('armR', 0.03 * br, 0, -0.07 - 0.02 * br, wi);
    add('armL', 0.03 * br, 0, 0.07 + 0.02 * br, wi);
    add('foreR', -0.12, 0, 0, wi);
    add('foreL', -0.12, 0, 0, wi);
    add('hips', 0, 0, Math.sin(t * 0.5) * 0.025, wi);
    add('legR', 0, 0.05, -0.03 - Math.sin(t * 0.5) * 0.025, wi);
    add('legL', 0, -0.05, 0.03 - Math.sin(t * 0.5) * 0.025, wi);
    add('shinR', 0.04, 0, 0, wi);
    add('shinL', 0.04, 0, 0, wi);
    rootY += br * 0.12 * wi;
    if (combat) {
      add('legR', -0.28, 0, -0.1, wi);
      add('shinR', 0.45, 0, 0, wi);
      add('legL', 0.22, 0, 0.1, wi);
      add('shinL', 0.4, 0, 0, wi);
      add('chest', 0.12, -0.25, 0, wi);
      add('head', 0, 0.25, 0, wi);
      rootY -= 0.9 * wi;
    }
  }
  // walk/run cycles
  const ww = clamp(s, 0, 1) * (s < 2 ? 1 : clamp(3 - s, 0, 1));
  const wr = clamp(s - 1, 0, 1);
  const wsp = clamp(s - 2, 0, 1);
  const moving = clamp(s, 0, 1);
  if (moving > 0) {
    const sn = Math.sin(phase),
      cs = Math.cos(phase);
    const legA = lerp(lerp(0.55, 0.95, wr), 1.15, wsp);
    const armA = lerp(lerp(0.5, 0.85, wr), 1.05, wsp);
    const knee = lerp(lerp(0.7, 1.3, wr), 1.6, wsp);
    const lean = lerp(lerp(0.04, 0.22, wr), 0.38, wsp);
    const bob = lerp(lerp(0.55, 1.2, wr), 1.5, wsp);
    add('legR', -sn * legA, 0, 0, moving);
    add('legL', sn * legA, 0, 0, moving);
    add('shinR', Math.max(0, cs) * knee + 0.08, 0, 0, moving);
    add('shinL', Math.max(0, -cs) * knee + 0.08, 0, 0, moving);
    add('armR', sn * armA, 0, -0.06, moving);
    add('armL', -sn * armA, 0, 0.06, moving);
    add('foreR', -lerp(0.2, 1.3, wr) - Math.max(0, -sn) * 0.35, 0, 0, moving);
    add('foreL', -lerp(0.2, 1.3, wr) - Math.max(0, sn) * 0.35, 0, 0, moving);
    add('chest', lean, sn * lerp(0.06, 0.16, wr), 0, moving);
    add('hips', 0, -sn * lerp(0.08, 0.18, wr), 0, moving);
    add('head', -lean * 0.5, -sn * 0.05, 0, moving);
    rootY += (-Math.abs(cs) * bob + bob * 0.6) * moving;
    // lean into turns
    add('chest', 0, 0, -p.turn * 0.15 * moving);
    add('hips', 0, 0, -p.turn * 0.08 * moving);
  }
  pose.rootY = rootY;
  void ww;
  return pose;
}

function crouchPose(pose, w, t, phase, moving) {
  const add = (b, x, y = 0, z = 0) => {
    const o = pose[b] || (pose[b] = [0, 0, 0]);
    o[0] += x * w;
    o[1] += y * w;
    o[2] += z * w;
  };
  add('chest', 0.45);
  add('head', -0.35);
  add('legR', -0.7 - Math.sin(phase) * 0.3 * moving);
  add('legL', -0.7 + Math.sin(phase) * 0.3 * moving);
  add('shinR', 1.2);
  add('shinL', 1.2);
  add('armR', -0.3, 0, -0.1);
  add('armL', -0.3, 0, 0.1);
  add('foreR', -0.8);
  add('foreL', -0.8);
  pose.rootY = (pose.rootY || 0) - 3.5 * w;
}

function airPose(vy, t) {
  const up = clamp(vy / 6, -1, 1);
  if (up > 0) {
    return {
      legR: [-0.8, 0, -0.05],
      shinR: [1.2, 0, 0],
      legL: [0.35, 0, 0.05],
      shinL: [0.5, 0, 0],
      armR: [-0.7, 0, -0.45],
      foreR: [-0.6, 0, 0],
      armL: [0.3, 0, 0.5],
      foreL: [-0.4, 0, 0],
      chest: [-0.05, 0, 0],
      head: [-0.1, 0, 0],
    };
  }
  const f = Math.sin(t * 9) * 0.12;
  return {
    legR: [-0.3, 0, -0.12],
    shinR: [0.6, 0, 0],
    legL: [0.1, 0, 0.12],
    shinL: [0.4, 0, 0],
    armR: [-0.4 + f, 0, -1.0],
    foreR: [-0.4, 0, 0],
    armL: [-0.4 - f, 0, 1.0],
    foreL: [-0.4, 0, 0],
    chest: [0.08, 0, 0],
    head: [0.15, 0, 0],
  };
}

const CLIMB = (t) => {
  const s = Math.sin(t * 6);
  return {
    armR: [-2.7 + s * 0.4, 0, -0.1],
    foreR: [-0.4 - Math.max(0, s) * 0.6, 0, 0],
    armL: [-2.7 - s * 0.4, 0, 0.1],
    foreL: [-0.4 - Math.max(0, -s) * 0.6, 0, 0],
    legR: [-0.6 - s * 0.4, 0, 0],
    shinR: [0.9, 0, 0],
    legL: [-0.6 + s * 0.4, 0, 0],
    shinL: [0.9, 0, 0],
    chest: [-0.1, 0, 0],
    head: [-0.3, 0, 0],
  };
};
const SWIM = (t) => {
  const s = Math.sin(t * 4),
    c = Math.cos(t * 4);
  return {
    hips: [1.1, 0, 0],
    head: [-0.9, 0, 0],
    armR: [-2.6 + c * 0.6, 0, -0.6 - s * 0.5],
    armL: [-2.6 + c * 0.6, 0, 0.6 + s * 0.5],
    foreR: [-0.3, 0, 0],
    foreL: [-0.3, 0, 0],
    legR: [s * 0.4, 0, -0.1],
    legL: [-s * 0.4, 0, 0.1],
    shinR: [0.3, 0, 0],
    shinL: [0.3, 0, 0],
  };
};
const RIDE = (t, gallop) => {
  const b = Math.sin(t * (gallop ? 14 : 6)) * (gallop ? 0.08 : 0.03);
  return {
    legR: [-1.2, 0, -0.45],
    shinR: [0.9, 0, 0],
    legL: [-1.2, 0, 0.45],
    shinL: [0.9, 0, 0],
    armR: [-0.8, 0, -0.1],
    foreR: [-0.7, 0, 0],
    armL: [-0.8, 0, 0.1],
    foreL: [-0.7, 0, 0],
    chest: [0.15 + (gallop ? 0.2 : 0) + b, 0, 0],
    head: [-0.1, 0, 0],
    rootY: -10.5,
  };
};
const SIT = () => ({
  legR: [-1.5, 0, -0.15],
  shinR: [1.5, 0, 0],
  legL: [-1.5, 0, 0.15],
  shinL: [1.5, 0, 0],
  armR: [-0.5, 0, -0.1],
  foreR: [-0.6, 0, 0],
  armL: [-0.5, 0, 0.1],
  foreL: [-0.6, 0, 0],
  chest: [0.1, 0, 0],
  rootY: -10,
});

/* ------------------------------------------------------------------ */
/* Animator                                                            */
/* ------------------------------------------------------------------ */
export class Animator {
  constructor(model, def = null) {
    this.model = model;
    this.bones = model.bones;
    this.creature = null;
    this.t = Math.random() * 10;
    this.phase = 0;
    this.params = {
      speed: 0,
      grounded: true,
      vy: 0,
      crouch: false,
      combat: false,
      climbing: false,
      swimming: false,
      riding: false,
      gallop: false,
      sitting: false,
      turn: 0,
      moveBlend: 0,
      runSpeed: 4.3,
      walkSpeed: 2,
    };
    this.airW = 0;
    this.crouchW = 0;
    this.combatW = 0;
    this.specialW = 0;
    this.actions = []; // {clip, t, w, fadeIn, fadeOut, speed, events fired, cb}
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.lookW = 0;
    this.lookTarget = null;
    this.blinkT = 2 + Math.random() * 3;
    this.blinking = 0;
    this.closedEyes = false;
    this.spring = {};
    this.stylePose = null; // weapon-specific hold pose (additive on arms)
    this.override = null; // static pose override (cutscenes)
    this.overrideW = 0;
    this.pose = {};
    this._locomotionPose = {};
    this.localVel = { x: 0, y: 0, z: 0 };
    this.chains = this.creature ? [] : this._findChains();
    const chainBones = new Set(this.chains.flatMap((c) => c.bones.map((b) => b.name)));
    this.animBones = this.creature
      ? Object.keys(this.bones).filter((n) => n !== 'lids')
      : BODY_BONES.filter((n) => this.bones[n] && !chainBones.has(n));
    if (def?.runSpeed) this.params.runSpeed = def.runSpeed;
  }

  _findChains() {
    const chains = [];
    const b = this.bones;
    const collect = (prefix) => {
      const list = [];
      for (let i = 0; b[prefix + i]; i++) list.push(b[prefix + i]);
      return list;
    };
    const cape = collect('cape');
    if (cape.length) chains.push({ type: 'cape', bones: cape });
    const tail = collect('tail');
    if (tail.length) chains.push({ type: 'tail', bones: tail });
    if (b.braid) chains.push({ type: 'braid', bones: [b.braid] });
    return chains.map((c) => ({
      ...c,
      ang: c.bones.map(() => [0, 0]),
      vel: c.bones.map(() => [0, 0]),
    }));
  }

  /** Play a keyframed clip. Returns a handle { done: Promise, stop() }. */
  play(
    name,
    { speed = 1, fadeIn = 0.06, fadeOut = 0.14, onEvent = null, priority = 1, mask = null } = {},
  ) {
    const clip = typeof name === 'string' ? CLIPS[name] : name;
    if (!clip) {
      console.warn('missing clip', name);
      return { done: Promise.resolve(), stop() {} };
    }
    // non-additive actions replace current non-additive actions
    if (!clip.additive)
      for (const a of this.actions) if (!a.clip.additive && !a.stopping) this._stop(a, 0.08);
    let resolve;
    const done = new Promise((r) => (resolve = r));
    const a = {
      clip,
      samplePose: {},
      name: typeof name === 'string' ? name : 'custom',
      t: 0,
      w: fadeIn > 0 ? 0 : 1,
      fadeIn,
      fadeOut,
      speed,
      onEvent,
      fired: new Set(),
      resolve,
      stopping: false,
      priority,
      mask: mask || clip.mask,
    };
    this.actions.push(a);
    return {
      done,
      action: a,
      stop: (f = fadeOut) => this._stop(a, f),
    };
  }
  _stop(a, f) {
    a.stopping = true;
    a.fadeOut = f;
  }
  stopAll(f = 0.1) {
    for (const a of this.actions) this._stop(a, f);
  }
  isPlaying(name) {
    return this.actions.some((a) => a.name === name && !a.stopping);
  }
  current() {
    return this.actions.find((a) => !a.clip.additive && !a.stopping) || null;
  }

  setOverride(pose, w = 1) {
    // A pose captured from this animator must survive reuse of its working buffer.
    this.override = pose === this._locomotionPose ? structuredClone(pose) : pose;
    this.overrideTargetW = pose ? w : 0;
  }

  lookAt(worldPos) {
    this.lookTarget = worldPos;
  }

  update(dt, root3d) {
    this.t += dt;
    const p = this.params;
    // locomotion blend from speed
    const target =
      p.speed < 0.05
        ? 0
        : p.speed <= p.walkSpeed
          ? p.speed / p.walkSpeed
          : p.speed <= p.runSpeed
            ? 1 + (p.speed - p.walkSpeed) / (p.runSpeed - p.walkSpeed)
            : 2 + clamp((p.speed - p.runSpeed) / 2.5, 0, 1);
    p.moveBlend = damp(p.moveBlend, target, 10, dt);
    const cycleLen = p.moveBlend < 1.5 ? 1.55 : 2.3; // metres per half cycle
    this.phase += (p.speed / cycleLen) * Math.PI * dt;
    this.airW = damp(this.airW, p.grounded || p.climbing || p.swimming || p.riding ? 0 : 1, 12, dt);
    this.crouchW = damp(this.crouchW, p.crouch && p.grounded ? 1 : 0, 12, dt);
    this.combatW = damp(this.combatW, p.combat ? 1 : 0, 6, dt);
    this.overrideW = damp(this.overrideW, this.overrideTargetW || 0, 8, dt);

    // --- base ---
    let pose;
    pose = locomotion(this.t, this.phase, p, this._locomotionPose, this.combatW > 0.5);
    if (!this.creature) {
      if (this.crouchW > 0.01)
        crouchPose(pose, this.crouchW, this.t, this.phase, clamp(p.moveBlend, 0, 1));
      if (this.stylePose && !p.riding && !p.swimming && !p.climbing)
        blendInto(pose, this.stylePose(this.t, p, this.combatW), 1, ARMS_AND_CHEST);
      if (this.airW > 0.01)
        blendReplace(pose, airPose(p.vy, this.t), this.airW, null, this.animBones);
      if (p.climbing) pose = CLIMB(this.t);
      if (p.swimming) pose = SWIM(this.t);
      if (p.riding) pose = RIDE(this.t, p.gallop);
      if (p.sitting) pose = SIT();
    }
    if (this.override && this.overrideW > 0.01)
      blendReplace(pose, this.override, this.overrideW, null, this.animBones);

    // --- actions ---
    for (const a of this.actions) {
      a.t += dt * a.speed;
      const c = a.clip;
      if (a.stopping) a.w -= dt / Math.max(0.001, a.fadeOut);
      else if (a.w < 1) a.w = Math.min(1, a.w + dt / Math.max(0.001, a.fadeIn));
      if (c.events && a.onEvent)
        for (const [ev, et] of Object.entries(c.events))
          if (a.t >= et && !a.fired.has(ev)) {
            a.fired.add(ev);
            a.onEvent(ev);
          }
      if (c.hit && a.onEvent) {
        if (a.t >= c.hit[0] && !a.fired.has('hitStart')) {
          a.fired.add('hitStart');
          a.onEvent('hitStart');
        }
        if (a.t >= c.hit[1] && !a.fired.has('hitEnd')) {
          a.fired.add('hitEnd');
          a.onEvent('hitEnd');
        }
      }
      if (a.t >= c.dur && !a.stopping) {
        if (c.loop) a.t %= c.dur;
        else if (!c.hold) {
          a.stopping = true;
          a.fadeOut = a.fadeOut || 0.12;
          a.onEvent?.('end');
        } else if (!a.fired.has('end')) {
          a.fired.add('end');
          a.onEvent?.('end');
          a.resolve();
        }
      }
      const cp = sampleClip(c, Math.min(a.t, c.dur), a.samplePose);
      const mask = a.mask === 'upper' ? UPPER : a.mask === 'arms' ? ARMS : null;
      const w = ease.inOutQuad(clamp(a.w, 0, 1));
      if (c.additive) blendInto(pose, cp, w, mask);
      else blendReplace(pose, cp, w, mask, this.animBones);
    }
    let active = 0;
    for (const a of this.actions) {
      if (a.w <= 0 && a.stopping) a.resolve();
      else this.actions[active++] = a;
    }
    this.actions.length = active;

    // --- look-at (head) ---
    if (this.lookTarget && root3d) {
      const hb = this.bones.head;
      const hp = hb.getWorldPosition(_v1);
      const dx = this.lookTarget.x - hp.x,
        dy = this.lookTarget.y - hp.y,
        dz = this.lookTarget.z - hp.z;
      const yawWorld = Math.atan2(dx, dz);
      let rel = yawWorld - root3d.rotation.y;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const want = Math.abs(rel) < 1.9;
      this.lookW = damp(this.lookW, want ? 1 : 0, 6, dt);
      this.lookYaw = damp(this.lookYaw, clamp(rel, -1.1, 1.1), 8, dt);
      this.lookPitch = damp(
        this.lookPitch,
        clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.6, 0.6),
        8,
        dt,
      );
    } else this.lookW = damp(this.lookW, 0, 5, dt);
    if (this.lookW > 0.01) {
      const h = pose.head || (pose.head = [0, 0, 0]);
      h[1] += this.lookYaw * 0.7 * this.lookW;
      h[0] += this.lookPitch * this.lookW;
      const c = pose.chest || (pose.chest = [0, 0, 0]);
      c[1] += this.lookYaw * 0.3 * this.lookW;
    }

    this.pose = pose;
    this._apply(pose, dt);
  }

  _apply(pose, dt) {
    const B = this.bones;
    for (const name of this.animBones) {
      const b = B[name];
      if (!b) continue;
      const r = pose[name];
      if (r) b.rotation.set(r[0], r[1], r[2]);
      else b.rotation.set(0, 0, 0);
    }
    const sc = this.model.scale;
    const root = B.root;
    if (root) {
      root.position.set(
        root.userData.rest.x + (pose.rootX || 0) * sc,
        root.userData.rest.y + (pose.rootY || 0) * sc,
        root.userData.rest.z + (pose.rootZ || 0) * sc,
      );
    }
    // blinking
    if (B.lids) {
      this.blinkT -= dt;
      if (this.blinkT <= 0) {
        this.blinking = 0.14;
        this.blinkT = 2 + Math.random() * 4;
      }
      if (this.blinking > 0) this.blinking -= dt;
      const closed = this.closedEyes || this.blinking > 0;
      B.lids.scale.set(1, closed ? 1 : 0.001, 1);
    }
    // secondary motion chains
    const vel = this.localVel || ZERO_VELOCITY;
    for (const ch of this.chains) {
      for (let i = 0; i < ch.bones.length; i++) {
        const k = ch.ang[i],
          v = ch.vel[i];
        let tx, tz;
        if (ch.type === 'cape') {
          tx =
            clamp(vel.z * 0.22 + Math.max(0, -vel.y) * 0.08, -0.1, 1.3) +
            Math.sin(this.t * 2.2 + i) * 0.04 +
            0.05 +
            (this.pose.chest?.[0] || 0) * -0.6;
          tz = clamp(-vel.x * 0.1, -0.4, 0.4) + Math.sin(this.t * 1.7 + i * 0.7) * 0.03;
          if (i > 0) tx *= 0.35;
        } else if (ch.type === 'tail') {
          tx =
            (i === 0 ? 0.55 : -0.25) +
            Math.sin(this.t * 2.5 + i * 0.9) * 0.08 -
            clamp(vel.z * 0.08, 0, 0.4);
          tz = 0;
          const ty = Math.sin(this.t * 1.8 + i * 0.8) * 0.35;
          k[2] = ty;
        } else {
          tx =
            clamp(vel.z * 0.15, 0, 0.8) -
            (this.pose.head?.[0] || 0) +
            (this.pose.chest?.[0] || 0) * -0.5;
          tz = Math.sin(this.t * 2 + i) * 0.05;
        }
        // damped spring
        const kS = 60,
          kD = 9;
        v[0] += ((tx - k[0]) * kS - v[0] * kD) * dt;
        v[1] += ((tz - k[1]) * kS - v[1] * kD) * dt;
        k[0] += v[0] * dt;
        k[1] += v[1] * dt;
        ch.bones[i].rotation.set(k[0], k[2] || 0, k[1]);
      }
    }
  }
}

const ARMS_AND_CHEST = new Set(['armR', 'foreR', 'handR', 'armL', 'foreL', 'handL', 'chest']);
const _v1 = new THREE.Vector3();
function sampleClip(clip, t, out) {
  const keys = clip.keys;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i];
    const [t1, p1, e] = keys[i + 1];
    if (t <= t1) {
      const f = (ease[e] || ease.inOutQuad)((t - t0) / Math.max(1e-5, t1 - t0));
      return lerpPose(p0, p1, f, out);
    }
  }
  return keys[keys.length - 1][1];
}

export function lerpPose(a, b, f, out = {}) {
  for (const n in out) if (!Object.hasOwn(a, n) && !Object.hasOwn(b, n)) delete out[n];
  const blend = (n) => {
    const va = a[n],
      vb = b[n];
    if (typeof va === 'number' || typeof vb === 'number') out[n] = lerp(va || 0, vb || 0, f);
    else {
      const A = va || ZERO,
        B = vb || ZERO;
      const r = Array.isArray(out[n]) ? out[n] : (out[n] = [0, 0, 0]);
      r[0] = lerp(A[0], B[0], f);
      r[1] = lerp(A[1], B[1], f);
      r[2] = lerp(A[2], B[2], f);
    }
  };
  for (const n in a) blend(n);
  for (const n in b) if (!Object.hasOwn(a, n)) blend(n);
  return out;
}
const ZERO = [0, 0, 0];
const ZERO_VELOCITY = { x: 0, y: 0, z: 0 };

/** Replace pose bones with src by weight (respecting mask). */
function blendReplace(pose, src, w, mask = null, boneList = BODY_BONES) {
  const blend = (n) => {
    if (n === 'rootY' || n === 'rootX' || n === 'rootZ') {
      if (!mask) pose[n] = lerp(pose[n] || 0, src[n] || 0, w);
      return;
    }
    if (mask && !mask.has(n)) return;
    if (n === 'root' && !src.root && !pose.root) return;
    if (n === 'rootLid') return;
    const a = pose[n] || (pose[n] = [0, 0, 0]),
      b = src[n] || ZERO;
    a[0] = lerp(a[0], b[0], w);
    a[1] = lerp(a[1], b[1], w);
    a[2] = lerp(a[2], b[2], w);
  };
  for (const n in src) blend(n);
  for (const n of boneList) if (!Object.hasOwn(src, n)) blend(n);
}

function blendInto(pose, src, w, mask = null) {
  for (const n of Object.keys(src)) {
    if (n === 'rootY' || n === 'rootX' || n === 'rootZ') {
      if (!mask) pose[n] = (pose[n] || 0) + src[n] * w;
      continue;
    }
    if (mask && !mask.has(n)) continue;
    const a = pose[n] || (pose[n] = [0, 0, 0]);
    a[0] += src[n][0] * w;
    a[1] += src[n][1] * w;
    a[2] += src[n][2] * w;
  }
}

/** Weapon hold poses (added on top of locomotion), by style. */
