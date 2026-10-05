/** Tracks the values that affect HUD pixels; simulation still runs every frame. */
export class HudState {
  changed(game, width, height, hint) {
    const hp = game.player.hp,
      maxHp = game.player.maxHp;
    const collected = game.progress.collected.length,
      alive = game.enemy.alive;
    const mode = game.mode,
      usingPad = game.input.usingPad;
    if (
      this.width === width &&
      this.height === height &&
      this.hp === hp &&
      this.maxHp === maxHp &&
      this.collected === collected &&
      this.alive === alive &&
      this.mode === mode &&
      this.usingPad === usingPad &&
      this.hint === hint
    )
      return false;
    this.width = width;
    this.height = height;
    this.hp = hp;
    this.maxHp = maxHp;
    this.collected = collected;
    this.alive = alive;
    this.mode = mode;
    this.usingPad = usingPad;
    this.hint = hint;
    return true;
  }
  invalidate() {
    this.width = undefined;
  }
}
