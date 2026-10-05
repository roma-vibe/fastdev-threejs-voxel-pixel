// Procedural Web Audio: no downloaded samples, soundtrack, or external requests.
const NOTES = [57, 64, 69, 71, 64, 60, 67, 72, 74, 67, 62, 69, 74, 76, 69, 64];
const SFX = {
  jump: [310, 520, 0.12],
  swing: [170, 60, 0.12],
  hit: [90, 45, 0.12],
  hurt: [140, 65, 0.2],
  step: [65, 35, 0.035],
  collect: [660, 990, 0.2],
  checkpoint: [440, 880, 0.4],
  block: [110, 70, 0.08],
};
export class AudioEngine {
  constructor() {
    this.volume = 0.4;
    this.time = 0;
    this.nextNote = 0;
    this.note = 0;
    this.ctx = null;
    this.voices = new Set();
  }
  async unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.setVolume(this.volume);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }
  setVolume(v) {
    this.volume = v;
    this.master?.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }
  tone(a, b, duration, gain = 0.1, type = 'triangle') {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx,
      o = c.createOscillator(),
      g = c.createGain(),
      t = c.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(a, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, b), t + duration);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g);
    g.connect(this.master);
    this.voices.add(o);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
      this.voices.delete(o);
    };
    o.start(t);
    o.stop(t + duration + 0.02);
  }
  sfx(name) {
    const s = SFX[name];
    if (s) this.tone(...s, name === 'step' ? 0.025 : 0.1, name === 'collect' ? 'sine' : 'triangle');
  }
  update(dt) {
    this.time += dt;
    if (this.time >= this.nextNote) {
      this.nextNote = this.time + 0.65;
      const n = NOTES[this.note++ % NOTES.length],
        hz = 440 * 2 ** ((n - 69) / 12);
      this.tone(hz, hz, 0.6, 0.025, 'sine');
      if (this.note % 4 === 0) this.tone(hz / 2, hz / 2, 1.8, 0.015, 'triangle');
    }
  }
  pause() {
    for (const o of this.voices) o.stop();
    this.nextNote = this.time + 0.2;
  }
  async dispose() {
    this.pause();
    await this.ctx?.close();
  }
}
