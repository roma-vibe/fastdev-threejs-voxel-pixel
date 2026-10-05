import * as THREE from 'three';
import { Renderer } from './render/Renderer.js';
import { Particles } from './render/Particles.js';
import { Atlas } from './world/Atlas.js';
import { VoxelRenderer } from './world/VoxelRenderer.js';
import { BLOCK, T_SOLID } from './world/Blocks.js';
import { Input } from './core/Input.js';
import { SaveSystem, freshSave } from './core/SaveSystem.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { Player } from './gameplay/Player.js';
import { Enemy } from './gameplay/Enemy.js';
import { CameraRig } from './gameplay/CameraRig.js';
import { editableCell, intersectsPlayer } from './gameplay/rules.js';
import { Hud } from './hud/Hud.js';
import { createDemo, DEMO } from '../content/demo.js';
const checkpointPosition = new THREE.Vector3(...DEMO.checkpoint);
const exitPosition = new THREE.Vector3(...DEMO.exit);

export class Game {
  constructor(canvas, hudCanvas, { slug, settings, onPause, onComplete, onError, onSave }) {
    this.canvas = canvas;
    this.hudCanvas = hudCanvas;
    this.settings = settings;
    this.onPause = onPause;
    this.onComplete = onComplete;
    this.onError = onError;
    this.onSave = onSave;
    this.saves = new SaveSystem(slug);
    this.audio = new AudioEngine();
    this.time = 0;
    this.mode = 'combat';
    this.running = false;
    this.disposed = false;
    this.ready = false;
    this.message = '';
    this.messageUntil = 0;
    this.last = 0;
    this.raf = 0;
    this._blur = () => this.pause();
    this._pointer = () => {
      if (this.running && this.input && !document.pointerLockElement) this.pause();
    };
    this._visibility = () => {
      if (document.hidden) this.pause();
    };
    this._unload = () => {
      // Only a running game has unsaved progress; an idle tab must not overwrite newer saves.
      if (this.running) this.save();
    };
    // Resizing or changing quality clears the canvas: redraw the paused scene behind the menus.
    this._redraw = () => {
      if (this.ready && !this.running && !this.disposed) this.renderer.render();
    };
    this._lost = (e) => {
      e.preventDefault();
      this.pause();
      onError('Graphics context lost. Return to the menu and reload the level.');
    };
    document.addEventListener('visibilitychange', this._visibility);
    document.addEventListener('pointerlockchange', this._pointer);
    window.addEventListener('blur', this._blur);
    window.addEventListener('pagehide', this._unload);
    canvas.addEventListener('webglcontextlost', this._lost);
  }
  async init(continueGame, progress = () => {}) {
    try {
      this.progress = continueGame ? this.saves.load() || freshSave() : freshSave();
      progress('Generating meadow', 0.1);
      this.renderer = new Renderer(this.canvas);
      window.addEventListener('resize', this._redraw);
      this.scene = this.renderer.scene;
      this.renderer.setEnv('day');
      this.world = createDemo();
      for (const [x, y, z, id] of this.progress.edits)
        if (editableCell(x, y, z)) this.world.setRaw(x, y, z, id);
      this.world.computeLighting();
      this.atlas = new Atlas();
      this.voxels = new VoxelRenderer(this.world, this.atlas, this.scene);
      progress('Building voxel meshes', 0.3);
      await this.voxels.buildAll((p) => progress('Building voxel meshes', 0.3 + p * 0.5));
      if (this.disposed) return;
      this.input = new Input(this.canvas);
      this.camera = new CameraRig(this);
      this.player = new Player(this, this.progress.checkpoint);
      this.enemy = new Enemy(this, DEMO.enemy, this.progress.enemyDefeated);
      this.camera.snapBehind(this.player);
      this.particles = new Particles(this.scene);
      this.particles.world = this.world;
      this.items = DEMO.crystals.map((p, i) => {
        const mesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.38),
          new THREE.MeshStandardMaterial({
            color: 0x76e6df,
            emissive: 0x1a9387,
            emissiveIntensity: 1.4,
            roughness: 0.35,
          }),
        );
        mesh.position.set(...p);
        mesh.visible = !this.progress.collected.includes(i);
        this.scene.add(mesh);
        return mesh;
      });
      this.beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 0.08, 12),
        new THREE.MeshBasicMaterial({ color: 0xe8c677 }),
      );
      this.beacon.position.set(DEMO.exit[0], 13.06, DEMO.exit[2]);
      this.scene.add(this.beacon);
      this.hud = new Hud();
      await this.hud.init(this.hudCanvas);
      if (this.disposed) {
        this.hud.dispose();
        return;
      }
      this.applySettings(this.settings);
      this.camera.update(1, this.player);
      this.renderer.focus.copy(this.player.pos);
      this.renderer.update(0);
      this.renderer.render();
      this.hud.update(this);
      this.ready = true;
      progress('Ready', 1);
      this.notify('Find three crystals, defeat the guardian, then activate the golden beacon.');
    } catch (e) {
      this.dispose();
      throw e;
    }
  }
  applySettings(s) {
    this.settings = s;
    this.audio.setVolume(s.volume);
    if (this.input) {
      this.input.sensitivity = s.sensitivity;
      this.input.invertY = s.invertY;
    }
    if (this.renderer) {
      const high = s.quality === 'high';
      this.renderer.setQuality({
        shadows: high,
        bloom: high,
        fxaa: true,
        pixelRatio: high ? 1 : 0.7,
        shadowRes: high ? 2048 : 512,
        clouds: high,
      });
      this.voxels?.setShadows(high);
      this._redraw();
    }
  }
  async unlockAudio() {
    try {
      await this.audio.unlock();
    } catch {
      /* Audio may be blocked; the game stays playable. */
    }
  }
  resume() {
    if (this.disposed || !this.player) return;
    this.running = true;
    this.input.enabled = true;
    this.input.wantLock = true;
    this.input.down.clear();
    this.input.endFrame();
    this.hud.visible = true;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }
  pause() {
    if (!this.running) return;
    this.running = false;
    this.input.enabled = false;
    this.input.wantLock = false;
    this.input.down.clear();
    this.input.releaseLock();
    cancelAnimationFrame(this.raf);
    this.audio.pause();
    this.save();
    this.onPause();
  }
  frame(t) {
    if (!this.running || this.disposed) return;
    try {
      const dt = Math.min(0.04, Math.max(0, (t - this.last) / 1000));
      this.last = t;
      this.input.poll();
      if (this.input.pressed('pause')) {
        this.pause();
        this.input.endFrame();
        return;
      }
      this.time += dt;
      this.player.update(dt);
      this.enemy.update(dt);
      this.camera.update(dt, this.player, this.input);
      for (let i = 0; i < this.items.length; i++) {
        const m = this.items[i];
        if (!m.visible) continue;
        m.rotation.y += dt;
        m.position.y = DEMO.crystals[i][1] + Math.sin(this.time * 2 + i) * 0.12;
        if (this.player.center.distanceTo(m.position) < 1.2) {
          m.visible = false;
          this.progress.collected.push(i);
          this.audio.sfx('collect');
          this.particles.ringBurst(m.position, 0x78e8db, 1, 16);
          this.player.heal(2);
          this.notify(`Crystal ${this.progress.collected.length}/3 collected`);
          this.save();
        }
      }
      if (this.messageUntil < this.time) this.message = '';
      this.renderer.focus.copy(this.player.pos);
      this.renderer.update(dt);
      this.voxels.update(dt, this.renderer.camera);
      this.particles.setFog(this.scene.fog, innerHeight);
      this.particles.update(dt);
      this.audio.update(dt);
      this.renderer.render();
      this.hud.update(this);
      this.input.endFrame();
      this.raf = requestAnimationFrame((n) => this.frame(n));
    } catch (e) {
      this.pause();
      this.onError(e.message || 'The game stopped unexpectedly.');
    }
  }
  notify(text) {
    this.message = text;
    this.messageUntil = this.time + 5;
  }
  interactionHint() {
    const p = this.player.pos;
    if (p.distanceTo(checkpointPosition) < 3) return 'E / Y  ·  Set checkpoint and heal';
    if (p.distanceTo(exitPosition) < 3)
      return this.progress.collected.length === 3 && !this.enemy.alive
        ? 'E / Y  ·  Activate beacon'
        : 'Beacon needs 3 crystals and a cleared guardian';
    return this.mode === 'build'
      ? 'Aim at a block · F remove · G place oak planks'
      : this.mode === 'mine'
        ? 'Aim at a block · F mine'
        : 'Explore the meadow · collect the glowing crystals';
  }
  interact() {
    const p = this.player.pos;
    if (p.distanceTo(checkpointPosition) < 3) {
      this.progress.checkpoint = [...DEMO.checkpoint];
      this.player.heal(20);
      this.audio.sfx('checkpoint');
      this.notify('Checkpoint saved · health restored');
      this.save();
    }
    if (
      p.distanceTo(exitPosition) < 3 &&
      this.progress.collected.length === 3 &&
      !this.enemy.alive
    ) {
      this.progress.completed = true;
      this.save();
      this.audio.sfx('checkpoint');
      this.pause();
      this.onComplete();
    }
  }
  editBlock(place) {
    const c = this.renderer.camera,
      dir = c.getWorldDirection(new THREE.Vector3()),
      r = this.world.raycast(
        c.position.x,
        c.position.y,
        c.position.z,
        dir.x,
        dir.y,
        dir.z,
        10,
        (id) => !!T_SOLID[id],
      );
    if (!r.hit) return;
    const x = r.x + (place ? r.nx : 0),
      y = r.y + (place ? r.ny : 0),
      z = r.z + (place ? r.nz : 0);
    if (new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5).distanceTo(this.player.center) > 6) {
      this.notify('Move closer to edit that block');
      return;
    }
    if (
      !editableCell(x, y, z) ||
      (place && (this.world.isSolid(x, y, z) || intersectsPlayer(x, y, z, this.player)))
    ) {
      this.notify('This space is protected or occupied');
      return;
    }
    const key = `${x},${y},${z}`;
    const existing = this.progress.edits.findIndex((e) => e.slice(0, 3).join(',') === key);
    if (existing < 0 && this.progress.edits.length >= 2048) {
      this.notify('Demo edit limit reached. Start a new game to reset the world.');
      return;
    }
    const id = place ? BLOCK.oak_planks : BLOCK.air;
    this.world.set(x, y, z, id);
    const edit = [x, y, z, id];
    if (existing >= 0) this.progress.edits[existing] = edit;
    else this.progress.edits.push(edit);
    this.particles.blockDust(
      new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5),
      place ? 0xb99159 : 0x999577,
    );
    this.audio.sfx('block');
    this.save();
  }
  respawn() {
    this.player.pos.set(...this.progress.checkpoint);
    this.player.vel.set(0, 0, 0);
    this.player.knock.set(0, 0, 0);
    this.player.fallStart = null;
    this.player.visualY = this.player.pos.y;
    this.player.hp = this.player.maxHp;
    this.player.alive = true;
    this.player.invuln = 2;
    this.camera.snapBehind(this.player);
    this.notify('Returned to checkpoint');
  }
  save() {
    if (this.progress) this.onSave?.(this.saves.write(this.progress));
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this._visibility);
    document.removeEventListener('pointerlockchange', this._pointer);
    window.removeEventListener('blur', this._blur);
    window.removeEventListener('pagehide', this._unload);
    window.removeEventListener('resize', this._redraw);
    this.canvas.removeEventListener('webglcontextlost', this._lost);
    this.input?.dispose();
    this.player?.remove();
    this.enemy?.remove();
    this.voxels?.dispose();
    this.atlas?.dispose();
    this.particles?.dispose();
    for (const m of [...(this.items || []), ...(this.beacon ? [this.beacon] : [])]) {
      m.geometry.dispose();
      m.material.dispose();
      m.removeFromParent();
    }
    this.hud?.dispose();
    this.renderer?.dispose();
    void this.audio.dispose();
  }
}
