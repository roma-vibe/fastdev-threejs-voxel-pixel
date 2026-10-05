import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GradeShader } from './GradeShader.js';
import { OutputGradePass } from './OutputGradePass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { Sky, Clouds } from './Sky.js';
import { ENV_PRESETS, lerpPreset } from './Environment.js';
import { voxelUniforms } from '../world/VoxelRenderer.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.setClearColor(0x000000, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1500);
    this.camera.position.set(0, 80, 0);
    this.baseFov = 70;
    this.fovKick = 0;

    this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -42;
    sc.right = 42;
    sc.top = 42;
    sc.bottom = -42;
    sc.near = 1;
    sc.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 2.2;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd7ff, 0x6b5a45, 1.2);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(this.ambient);
    this.scene.fog = new THREE.Fog(0xb4d4f4, 60, 230);

    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    this.clouds = new Clouds();
    this.scene.add(this.clouds.group);

    this.focus = new THREE.Vector3();
    this.sunDir = new THREE.Vector3(0.3, 0.8, 0.2).normalize();
    this.env = { ...ENV_PRESETS.day };
    this.envFrom = null;
    this.envTo = null;
    this.envT = 1;
    this.envDur = 0;

    this.composer = new EffectComposer(r);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.5, 0.82);
    this.output = new OutputPass();
    this.grade = new ShaderPass(GradeShader);
    this.outputGrade = new OutputGradePass(this.grade.uniforms);
    this.fxaa = new FXAAPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.grade);
    this.composer.addPass(this.outputGrade);
    this.composer.addPass(this.fxaa);

    this.effects = {
      hurt: 0,
      heal: 0,
      chroma: 0,
      fade: 0,
      desat: 0,
      actionTint: new THREE.Vector4(),
    };
    this.quality = { shadows: true, bloom: true, fxaa: true, pixelRatio: 1, shadowRes: 2048 };
    this.extraSepia = 0;
    this.time = 0;
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.applyEnv(this.env);
  }

  setQuality(q) {
    Object.assign(this.quality, q);
    this.renderer.shadowMap.enabled = !!q.shadows;
    this.sun.castShadow = !!q.shadows;
    if (q.shadowRes && this.sun.shadow.mapSize.x !== q.shadowRes) {
      this.sun.shadow.mapSize.set(q.shadowRes, q.shadowRes);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.bloom.enabled = !!q.bloom;
    this.fxaa.enabled = !!q.fxaa;
    this.clouds.group.visible = q.clouds !== false && this.env.clouds !== false;
    this.resize();
  }

  resize() {
    const w = window.innerWidth,
      h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 2) * (this.quality?.pixelRatio ?? 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * pr * 0.5, h * pr * 0.5);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Switch to an env preset (name or object), blending over `dur` seconds. */
  setEnv(preset, dur = 0) {
    const target = typeof preset === 'string' ? ENV_PRESETS[preset] : preset;
    if (!target) return;
    if (dur <= 0) {
      this.env = { ...target };
      this.envTo = null;
      this.applyEnv(this.env);
      return;
    }
    this.envFrom = { ...this.env };
    this.envTo = { ...target };
    this.envT = 0;
    this.envDur = dur;
  }

  applyEnv(e) {
    const el = THREE.MathUtils.degToRad(e.sunElevation),
      az = THREE.MathUtils.degToRad(e.sunAzimuth);
    this.sunDir
      .set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az))
      .normalize();
    const moonUp = e.moon || e.sunElevation < 0;
    const lightDir =
      moonUp && e.sunElevation < 0 ? this.sunDir.clone().multiplyScalar(-1) : this.sunDir.clone();
    if (lightDir.y < 0.15) lightDir.y = 0.15;
    this.lightDir = lightDir.normalize();
    this.sun.color.set(e.sunColor);
    this.sun.intensity = e.sunIntensity;
    this.hemi.color.set(e.hemiSky);
    this.hemi.groundColor.set(e.hemiGround);
    this.hemi.intensity = e.hemiIntensity;
    this.ambient.intensity = e.ambient;
    const u = this.sky.uniforms;
    u.uTop.value.set(e.skyTop);
    u.uHorizon.value.set(e.skyHorizon);
    u.uBottom.value.set(e.skyBottom);
    u.uSunDir.value.copy(this.sunDir);
    u.uMoonDir.value.copy(this.sunDir).multiplyScalar(-1);
    u.uSunColor.value.set(e.sunColor);
    u.uGlow.value = e.glow;
    u.uGlowColor.value.set(e.glowColor);
    u.uStars.value = e.stars;
    u.uAurora.value = e.aurora;
    u.uAuroraColor.value.set(e.auroraColor);
    u.uSunSize.value = e.sunSize;
    this.scene.fog.color.set(e.fogColor);
    this.renderer.setClearColor(e.noSky ? this.scene.fog.color : 0x000000, 1);
    this.scene.fog.near = e.fogNear;
    this.scene.fog.far = e.fogFar;
    this.renderer.toneMappingExposure = e.exposure;
    const g = this.grade.uniforms;
    g.uSaturation.value = e.saturation;
    g.uContrast.value = e.contrast;
    g.uLift.value.set(...e.lift);
    g.uGain.value.set(...e.gain);
    g.uVignette.value = e.vignette;
    g.uSepia.value = e.sepia;
    this.bloom.strength = e.bloom;
    this.bloom.threshold = e.bloomThreshold;
    this.bloom.radius = 0.55;
    this.clouds.setColor(e.cloudColor, e.cloudOpacity);
    this.clouds.group.visible = e.clouds !== false && this.quality?.clouds !== false;
    voxelUniforms.uTorchStrength.value = e.torch;
    voxelUniforms.uMinLight.value = e.minLight;
    voxelUniforms.uSunColor.value
      .set(e.sunColor)
      .multiplyScalar(Math.max(0.2, e.sunIntensity / 2.4));
  }

  update(dt) {
    this.time += dt;
    if (this.envTo) {
      this.envT = Math.min(1, this.envT + dt / this.envDur);
      this.env = lerpPreset(this.envFrom, this.envTo, this.envT);
      this.applyEnv(this.env);
      if (this.envT >= 1) this.envTo = null;
    }
    // shadow camera follows focus, snapped to texels to avoid shimmer
    const sc = this.sun.shadow.camera;
    const texel = (sc.right - sc.left) / this.sun.shadow.mapSize.x;
    const f = this.focus;
    const d = this.lightDir;
    const tx = Math.round(f.x / texel) * texel,
      ty = Math.round(f.y / texel) * texel,
      tz = Math.round(f.z / texel) * texel;
    this.sun.target.position.set(tx, ty, tz);
    this.sun.position.set(tx + d.x * 120, ty + d.y * 120, tz + d.z * 120);
    this.sun.target.updateMatrixWorld();

    // view-space sun direction for water specular
    voxelUniforms.uSunDirView.value
      .copy(this.lightDir)
      .transformDirection(this.camera.matrixWorldInverse);

    this.sky.update(dt, this.camera);
    this.clouds.update(dt, this.camera);

    const cam = this.camera;
    const fov = this.baseFov + this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }

    const fx = this.effects;
    fx.hurt = Math.max(0, fx.hurt - dt * 1.6);
    fx.heal = Math.max(0, fx.heal - dt * 1.2);
    fx.chroma = Math.max(0, fx.chroma - dt * 3);
    fx.actionTint.w = Math.max(0, fx.actionTint.w - dt * 1.5);
    const g = this.grade.uniforms;
    g.uHurt.value = Math.min(0.85, fx.hurt);
    g.uHeal.value = fx.heal;
    g.uChroma.value = fx.chroma;
    g.uFade.value = fx.fade;
    g.uDesat.value = fx.desat;
    g.uTime.value = this.time;
    g.uActionTint.value.copy(fx.actionTint);
    g.uSepia.value = Math.min(1, (this.env.sepia || 0) + this.extraSepia);
  }

  render() {
    // Chromatic offsets need filtered samples of the already converted image.
    // Keep the original two-pass path while that effect is active.
    const separate = this.grade.uniforms.uChroma.value > 0;
    this.output.enabled = this.grade.enabled = separate;
    this.outputGrade.enabled = !separate;
    this.composer.render();
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    const geometries = new Set(),
      materials = new Set();
    for (const root of [this.sky.mesh, this.clouds.group])
      root.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) for (const m of [o.material].flat()) materials.add(m);
      });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    this.sun.shadow.dispose();
    for (const pass of this.composer.passes) pass.dispose?.();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
