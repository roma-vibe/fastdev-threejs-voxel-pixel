<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { Game } from './game/Game.js';
import { SaveSystem } from './game/core/SaveSystem.js';
import { loadSettings, saveSettings } from './game/core/Settings.js';
const canvasVersion = ref(0);
const name = __APP_NAME__,
  slug = __APP_SLUG__,
  canvas = ref(null),
  hudCanvas = ref(null),
  screen = ref('loading'),
  loading = ref({ text: 'Preparing world', amount: 0 }),
  error = ref(''),
  saveWarning = ref(false),
  resetDialog = ref(false),
  settings = reactive(loadSettings(slug)),
  hasSave = ref(!!new SaveSystem(slug).load());
let game = null,
  closed = false,
  played = false,
  previous = 'menu';
async function prepare(continuing) {
  screen.value = 'loading';
  error.value = '';
  game?.dispose();
  canvasVersion.value++;
  await nextTick();
  const current = new Game(canvas.value, hudCanvas.value, {
    slug,
    settings: { ...settings },
    onPause: () => {
      if (screen.value === 'playing') screen.value = 'pause';
    },
    onComplete: () => (screen.value = 'complete'),
    onError: (text) => {
      error.value = text;
      screen.value = 'error';
    },
    onSave: (ok) => {
      saveWarning.value = !ok;
      if (ok) hasSave.value = true;
    },
  });
  game = current;
  try {
    await current.init(continuing, (text, amount) => {
      loading.value = { text, amount };
    });
    if (!closed && game === current && screen.value === 'loading') screen.value = 'menu';
  } catch (e) {
    if (!closed && game === current) {
      error.value = e.message;
      screen.value = 'error';
    }
  }
}
async function play(continuing) {
  if (!continuing && hasSave.value) {
    resetDialog.value = true;
    return;
  }
  // Without a save (e.g. blocked storage) a new game must not resume the session already played.
  if (!continuing && played) await prepare(false);
  start();
}
function start() {
  if (screen.value === 'error') return;
  played = true;
  screen.value = 'playing';
  game.save();
  game.resume();
  void game.unlockAudio();
}
async function reset() {
  resetDialog.value = false;
  await prepare(false);
  start();
}
function apply() {
  game?.applySettings({ ...settings });
  if (!saveSettings(slug, settings)) saveWarning.value = true;
}
function openSettings() {
  previous = screen.value;
  screen.value = 'settings';
}
function menu() {
  game.pause();
  game.hud.visible = false;
  screen.value = 'menu';
}
onMounted(async () => {
  await prepare(hasSave.value);
  if (game?.hud) game.hud.visible = false;
});
onBeforeUnmount(() => {
  closed = true;
  game?.dispose();
});
</script>
<template>
  <main>
    <canvas
      ref="canvas"
      :key="`world-${canvasVersion}`"
      class="world"
      aria-label="Third-person voxel meadow"
    ></canvas>
    <canvas ref="hudCanvas" :key="`hud-${canvasVersion}`" class="hud" aria-hidden="true"></canvas>
    <div v-if="screen !== 'playing'" class="shade"></div>
    <div v-if="saveWarning" class="save-warning" role="status">
      Browser storage unavailable. This session remains playable, but progress cannot be saved.
    </div>
    <section v-if="screen === 'loading'" class="panel loading" aria-live="polite">
      <p class="eyebrow">VOXEL ADVENTURE</p>
      <h1>Growing a little world.</h1>
      <p>{{ loading.text }}</p>
      <progress :value="loading.amount" max="1"></progress>
    </section>
    <section v-else-if="screen === 'menu'" class="menu">
      <div class="menu-main">
        <p class="eyebrow"><span class="cube">◆</span> A WORLD OF POSSIBILITIES</p>
        <h1>{{ name }}</h1>
        <p class="subtitle">A small adventure.<br />Room for a much bigger one.</p>
        <div class="actions">
          <button class="primary" :disabled="!hasSave" @click="play(true)">
            Continue adventure <span>→</span></button
          ><button :class="{ primary: !hasSave }" @click="play(false)">
            New adventure <span>＋</span></button
          ><button @click="openSettings">Settings <span>⚙</span></button>
        </div>
        <p class="small">Saves stay in this browser. Keyboard, mouse & gamepad.</p>
      </div>
      <aside class="level-card">
        <p class="eyebrow">THE DEMO WORLD</p>
        <h2>Meadow Crossing</h2>
        <p>Follow the river. Cross the bridge.<br />Find the light between the trees.</p>
        <ol>
          <li>Collect three crystals</li>
          <li>Defeat the training guardian</li>
          <li>Activate the golden beacon</li>
        </ol>
        <div class="card-footer">Explore · Fight · Build</div>
      </aside>
      <footer>
        <span>THREE.JS / PIXIJS / VUE</span><span>PROCEDURAL WORLD · LOCAL SAVES</span>
      </footer>
    </section>
    <section v-else-if="screen === 'pause'" class="panel">
      <p class="eyebrow">TAKE A BREATH</p>
      <h1>Adventure paused</h1>
      <p>Your checkpoint and world edits are saved.</p>
      <div class="actions">
        <button class="primary" @click="start">Resume <span>→</span></button
        ><button @click="openSettings">Settings</button
        ><button @click="menu">Return to menu</button>
      </div>
      <p class="small">
        WASD / arrows move · Space jump · Shift run · C crouch<br />Mouse looks · F / left click
        attacks · E interacts<br />1 sword · 2 mining · 3 building · G / right click places<br />Scroll
        zooms · R returns to checkpoint · P / Esc pauses
      </p>
    </section>
    <section v-else-if="screen === 'settings'" class="panel">
      <p class="eyebrow">MAKE IT YOURS</p>
      <h1>Settings</h1>
      <div class="settings">
        <label
          >Graphics
          <select v-model="settings.quality" @change="apply">
            <option value="high">High · shadows & bloom</option>
            <option value="low">Low · faster rendering</option>
          </select></label
        >
        <label
          >Sound <span>{{ Math.round(settings.volume * 100) }}%</span
          ><input
            v-model.number="settings.volume"
            type="range"
            min="0"
            max="1"
            step=".05"
            @input="apply"
        /></label>
        <label
          >Look sensitivity <span>{{ settings.sensitivity.toFixed(1) }}</span
          ><input
            v-model.number="settings.sensitivity"
            type="range"
            min=".2"
            max="3"
            step=".1"
            @input="apply"
        /></label>
        <label
          >Field of view <span>{{ settings.fov }}°</span
          ><input
            v-model.number="settings.fov"
            type="range"
            min="50"
            max="100"
            step="1"
            @input="apply"
        /></label>
        <label
          >Camera shake <span>{{ Math.round(settings.cameraShake * 100) }}%</span
          ><input
            v-model.number="settings.cameraShake"
            type="range"
            min="0"
            max="1"
            step=".1"
            @input="apply"
        /></label>
        <label class="checkbox"
          ><input v-model="settings.invertY" type="checkbox" @change="apply" />Invert vertical
          look</label
        >
      </div>
      <button class="primary" @click="screen = previous">Done</button>
    </section>
    <section v-else-if="screen === 'complete'" class="panel">
      <p class="eyebrow">MEADOW CROSSING</p>
      <h1>A little world, explored.</h1>
      <p>
        All three crystals found. Guardian cleared. Beacon lit.<br />Your next adventure can start
        here.
      </p>
      <div class="actions">
        <button class="primary" @click="start">Keep exploring & building <span>→</span></button
        ><button @click="menu">Return to menu</button>
      </div>
    </section>
    <section v-else-if="screen === 'error'" class="panel" role="alert">
      <p class="eyebrow">SOMETHING INTERRUPTED THE ADVENTURE</p>
      <h1>Unable to run the game</h1>
      <p>{{ error }}</p>
      <p class="small">Use a browser with WebGL2 and hardware acceleration enabled.</p>
      <button class="primary" @click="prepare(hasSave)">Retry</button>
    </section>
    <div v-if="resetDialog" class="dialog-backdrop">
      <section class="panel" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <h2 id="reset-title">Start a new adventure?</h2>
        <p>This replaces the saved demo progress and block edits in this browser.</p>
        <div class="actions">
          <button class="primary" @click="reset">Start new adventure</button
          ><button @click="resetDialog = false">Keep my adventure</button>
        </div>
      </section>
    </div>
  </main>
</template>
