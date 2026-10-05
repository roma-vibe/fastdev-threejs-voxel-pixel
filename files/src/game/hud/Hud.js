import { HudState } from './HudState.js';
import { Application, Graphics, Text } from 'pixi.js';
export class Hud {
  async init(canvas) {
    this.state = new HudState();
    this.app = new Application();
    await this.app.init({
      canvas,
      backgroundAlpha: 0,
      resizeTo: window,
      autoStart: false,
      resolution: Math.min(devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
    });
    this._onRestore = () => this.state.invalidate();
    canvas.addEventListener('webglcontextrestored', this._onRestore);
    this.shapes = new Graphics();
    this.app.stage.addChild(this.shapes);
    const text = (size, color = 0xf4f1da) =>
      new Text({
        text: '',
        style: {
          fontFamily: 'monospace',
          fontSize: size,
          fill: color,
          dropShadow: { color: 0x07111a, blur: 2, distance: 2 },
        },
      });
    this.status = text(15);
    this.hint = text(14);
    this.mode = text(13);
    for (const t of [this.status, this.hint, this.mode]) this.app.stage.addChild(t);
  }
  update(g) {
    const w = this.app.screen.width,
      h = this.app.screen.height,
      s = this.shapes;
    const hint = g.message || g.interactionHint();
    if (!this.state.changed(g, w, h, hint)) return;
    s.clear();
    s.roundRect(20, 20, 260, 76, 6).fill({ color: 0x101b20, alpha: 0.72 });
    for (let i = 0; i < 10; i++) {
      const x = 34 + i * 23,
        y = 40;
      s.poly([
        x,
        y + 4,
        x + 4,
        y,
        x + 9,
        y + 3,
        x + 14,
        y,
        x + 18,
        y + 4,
        x + 18,
        y + 10,
        x + 9,
        y + 18,
        x,
        y + 10,
      ]).fill(i * 2 < g.player.hp ? 0xe36e64 : 0x4d4f52);
    }
    this.status.text = `CRYSTALS ${g.progress.collected.length}/3   GUARD ${g.enemy.alive ? 'ALIVE' : 'CLEARED'}`;
    this.status.position.set(34, 72);
    s.moveTo(w / 2 - 6, h / 2)
      .lineTo(w / 2 + 6, h / 2)
      .moveTo(w / 2, h / 2 - 6)
      .lineTo(w / 2, h / 2 + 6)
      .stroke({ color: 0xffffff, width: 2, alpha: 0.8 });
    const boxes = [
      ['combat', '1  SWORD'],
      ['mine', '2  MINE'],
      ['build', '3  BLOCKS'],
    ];
    const width = 330,
      x0 = (w - width) / 2;
    boxes.forEach(([mode, label], i) => {
      s.roundRect(x0 + i * 112, h - 62, 106, 40, 3)
        .fill({ color: g.mode === mode ? 0x526754 : 0x152329, alpha: 0.9 })
        .stroke({ color: g.mode === mode ? 0xe6c779 : 0x69797a, width: 2 });
      if (!this.labels) this.labels = [];
      if (!this.labels[i]) {
        this.labels[i] = new Text({
          text: label,
          style: { fontFamily: 'monospace', fontSize: 13, fill: 0xf4f1da },
        });
        this.app.stage.addChild(this.labels[i]);
      }
      this.labels[i].position.set(x0 + i * 112 + 10, h - 49);
    });
    this.hint.text = hint;
    this.hint.anchor.set(0.5);
    this.hint.position.set(w / 2, h - 96);
    this.mode.text = g.input.usingPad
      ? 'LEFT STICK move · RIGHT STICK look · A jump · X attack · Y interact'
      : 'WASD move · SHIFT run · SPACE jump · E interact · F attack · G place · P pause';
    this.mode.anchor.set(0.5);
    this.mode.position.set(w / 2, h - 12);
    this.mode.visible = w > 800;
    this.app.render();
  }
  set visible(v) {
    if (this.app?.renderer) this.app.canvas.style.visibility = v ? 'visible' : 'hidden';
  }
  dispose() {
    // Before init resolves Pixi has no renderer to destroy; Game.init disposes the HUD afterwards.
    if (!this.app?.renderer) return;
    this.app.canvas.removeEventListener('webglcontextrestored', this._onRestore);
    this.app.destroy(false, { children: true, texture: true, textureSource: true });
    this.app = null;
  }
}
