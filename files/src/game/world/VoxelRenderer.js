import * as THREE from 'three';
import { Mesher } from './Mesher.js';
import { SECTION } from './World.js';
import { makeLiquidTexture } from './Atlas.js';

export const voxelUniforms = {
  uTime: { value: 0 },
  uTorchStrength: { value: 1.25 },
  uMinLight: { value: 0.035 },
  uSunDirView: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uWindStrength: { value: 1 },
};

const LIGHT_VERT_PARS = /* glsl */ `
attribute vec4 aLight;
attribute vec4 aTorch;
varying vec4 vLight;
varying vec3 vTorch;
uniform float uTime;
uniform float uWindStrength;
`;
const LIGHT_FRAG_PARS = /* glsl */ `
varying vec4 vLight;
varying vec3 vTorch;
uniform float uTorchStrength;
uniform float uMinLight;
uniform float uTime;
`;
const LIGHT_APPLY = /* glsl */ `
  float skyL = vLight.x;
  float aoL = vLight.y;
  reflectedLight.directDiffuse *= skyL * (0.45 + 0.55 * aoL);
  reflectedLight.indirectDiffuse *= (0.18 + 0.82 * skyL) * aoL;
  reflectedLight.indirectDiffuse += diffuseColor.rgb * (vTorch * uTorchStrength + uMinLight) * aoL;
`;

function patchVoxel(material, { wind = false, water = false, lava = false, tiled = false } = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, voxelUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + LIGHT_VERT_PARS)
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vLight = aLight;
        vTorch = aTorch.rgb;
        ${
          wind
            ? `{
          float w = aLight.z * uWindStrength;
          if (w > 0.0) {
            vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
            float t = uTime;
            transformed.x += (sin(t * 1.9 + wp.x * 0.7 + wp.z * 0.45) * 0.055 + sin(t * 4.3 + wp.y * 1.3 + wp.x) * 0.018) * w;
            transformed.z += (cos(t * 1.5 + wp.z * 0.6 + wp.x * 0.35) * 0.045 + cos(t * 3.7 + wp.y * 0.9) * 0.015) * w;
          }
        }`
            : ''
        }
        ${
          water
            ? `{
          if (aLight.z > 0.5) {
            vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
            transformed.y += sin(uTime * 1.6 + wp.x * 0.9 + wp.z * 0.6) * 0.035 + cos(uTime * 1.2 + wp.z * 1.1) * 0.025 - 0.05;
          }
        }`
            : ''
        }`,
      );
    if (tiled) {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec4 aTile;\nvarying vec4 vTile;',
        )
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvTile = aTile;');
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
          varying vec4 vTile;
          vec4 atlasSample(sampler2D tex, vec2 uv) {
            vec2 dx = dFdx(uv), dy = dFdy(uv);
            if (vTile.z > 0.0) {
              // Derivatives before fract preserve mip selection and anisotropic filtering at tile seams.
              return textureGrad(tex, vTile.xy + fract(uv) * vTile.zw, dx * vTile.zw, dy * vTile.zw);
            }
            return texture2D(tex, uv);
          }`,
      );
      // Retain Three.js's standard map behavior while repeating only merged atlas faces.
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <map_fragment>',
          THREE.ShaderChunk.map_fragment.replace(
            'texture2D( map, vMapUv )',
            'atlasSample( map, vMapUv )',
          ),
        )
        .replace(
          '#include <emissivemap_fragment>',
          THREE.ShaderChunk.emissivemap_fragment.replace(
            'texture2D( emissiveMap, vEmissiveMapUv )',
            'atlasSample( emissiveMap, vEmissiveMapUv )',
          ),
        );
    }
    if (water || lava) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        #ifdef USE_MAP
          vMapUv = uv * ${lava ? '0.25' : '0.5'};
        #endif`,
      );
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\n' + LIGHT_FRAG_PARS,
    );
    if (water) {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform vec3 uSunDirView;\nuniform vec3 uSunColor;',
        )
        .replace(
          '#include <map_fragment>',
          /* glsl */ `
          vec4 t1 = texture2D(map, vMapUv + vec2(uTime * 0.021, uTime * 0.013));
          vec4 t2 = texture2D(map, vMapUv * 0.63 + vec2(-uTime * 0.017, uTime * 0.027));
          vec4 wt = mix(t1, t2, 0.5);
          diffuseColor.rgb *= mix(vec3(0.8), vec3(1.25), wt.rgb);
        `,
        )
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${LIGHT_APPLY}`)
        .replace(
          '#include <opaque_fragment>',
          /* glsl */ `
          vec3 viewDir = normalize(vViewPosition);
          float fres = pow(1.0 - clamp(abs(dot(normal, viewDir)), 0.0, 1.0), 3.0);
          vec3 refl = reflect(-uSunDirView, normal);
          float spec = pow(max(dot(refl, viewDir), 0.0), 90.0) * vLight.x;
          outgoingLight += uSunColor * spec * 1.6 * (0.6 + 0.4 * wt.r);
          diffuseColor.a = clamp(diffuseColor.a + fres * 0.35, 0.0, 0.96);
          #include <opaque_fragment>`,
        );
    } else if (lava) {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <map_fragment>',
          /* glsl */ `
          vec2 luv = vMapUv + vec2(sin(uTime * 0.3 + vMapUv.y * 6.0) * 0.03, uTime * 0.012);
          vec4 l1 = texture2D(map, luv);
          vec4 l2 = texture2D(map, vMapUv * 1.7 + vec2(uTime * -0.01, uTime * 0.02));
          diffuseColor.rgb *= mix(l1.rgb, l2.rgb, 0.4);
        `,
        )
        .replace(
          '#include <emissivemap_fragment>',
          'totalEmissiveRadiance = diffuseColor.rgb * (1.1 + 0.25 * sin(uTime * 1.3 + vMapUv.x * 8.0));',
        )
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${LIGHT_APPLY}`);
    } else {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>\n${LIGHT_APPLY}`,
      );
    }
  };
  material.customProgramCacheKey = () => `voxel-${wind}-${water}-${lava}-${tiled}`;
  return material;
}

export function createVoxelMaterials(atlas, env = {}) {
  const common = {
    map: atlas.texture,
    emissiveMap: atlas.emissiveTexture,
    emissive: new THREE.Color(1, 1, 1),
  };
  const opaque = patchVoxel(new THREE.MeshLambertMaterial({ ...common }), { tiled: true });
  const cutout = patchVoxel(
    new THREE.MeshLambertMaterial({ ...common, alphaTest: 0.5, side: THREE.FrontSide }),
    { wind: true },
  );
  const translucent = patchVoxel(
    new THREE.MeshLambertMaterial({ ...common, transparent: true, depthWrite: false, opacity: 1 }),
  );
  const waterTex = makeLiquidTexture('water');
  const water = patchVoxel(
    new THREE.MeshLambertMaterial({
      map: waterTex,
      color: new THREE.Color(env.water ?? 0x3a6fd0),
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.FrontSide,
    }),
    { water: true },
  );
  const lavaTex = makeLiquidTexture('lava');
  const lava = patchVoxel(
    new THREE.MeshLambertMaterial({ map: lavaTex, emissive: new THREE.Color(1, 1, 1) }),
    { lava: true },
  );
  return { opaque, cutout, translucent, water, lava };
}

/**
 * Owns the section meshes for a World and keeps them in sync with block changes.
 */
export class VoxelRenderer {
  constructor(world, atlas, scene, env = {}) {
    this.world = world;
    this.atlas = atlas;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'voxels';
    scene.add(this.group);
    this.mesher = new Mesher(world, atlas);
    this.materials = createVoxelMaterials(atlas, env);
    this.sections = new Map(); // key -> {meshes: [], center: Vector3}
    this.renderDistance = 160;
    this.shadows = true;
  }

  key(sx, sy, sz) {
    return sx + this.world.nsx * (sz + this.world.nsz * sy);
  }

  buildSection(sx, sy, sz) {
    const k = this.key(sx, sy, sz);
    const old = this.sections.get(k);
    if (old)
      for (const m of old.meshes) {
        this.group.remove(m);
        m.geometry.dispose();
      }
    const data = this.mesher.build(sx, sy, sz);
    const meshes = [];
    for (const [bucket, arr] of Object.entries(data)) {
      if (!arr) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(arr.position, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(arr.normal, 3, true));
      g.setAttribute('uv', new THREE.BufferAttribute(arr.uv, 2));
      if (arr.aTile) g.setAttribute('aTile', new THREE.BufferAttribute(arr.aTile, 4));
      g.setAttribute('aLight', new THREE.BufferAttribute(arr.aLight, 4, true));
      g.setAttribute('aTorch', new THREE.BufferAttribute(arr.aTorch, 4, true));
      g.setIndex(new THREE.BufferAttribute(arr.index, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const m = new THREE.Mesh(g, this.materials[bucket]);
      m.matrixAutoUpdate = false;
      m.receiveShadow = true;
      m.castShadow = this.shadows && (bucket === 'opaque' || bucket === 'cutout');
      if (bucket === 'water' || bucket === 'translucent') m.renderOrder = 2;
      m.userData.bucket = bucket;
      this.group.add(m);
      meshes.push(m);
    }
    const center = new THREE.Vector3(
      (sx + 0.5) * SECTION,
      (sy + 0.5) * SECTION,
      (sz + 0.5) * SECTION,
    );
    this.sections.set(k, { meshes, center, sx, sy, sz });
  }

  async buildAll(onProgress) {
    const { nsx, nsy, nsz } = this.world;
    const total = nsx * nsy * nsz;
    let done = 0;
    let t0 = performance.now();
    for (let sy = 0; sy < nsy; sy++)
      for (let sz = 0; sz < nsz; sz++)
        for (let sx = 0; sx < nsx; sx++) {
          this.buildSection(sx, sy, sz);
          done++;
          if (performance.now() - t0 > 30) {
            onProgress?.(done / total);
            await new Promise((r) => setTimeout(r, 0));
            t0 = performance.now();
          }
        }
    this.world.dirty.clear();
    onProgress?.(1);
  }

  setShadows(on) {
    this.shadows = on;
    for (const s of this.sections.values())
      for (const m of s.meshes)
        m.castShadow = on && (m.userData.bucket === 'opaque' || m.userData.bucket === 'cutout');
  }

  update(dt, camera, maxRebuild = 6) {
    voxelUniforms.uTime.value += dt;
    const w = this.world;
    w.flushRelight();
    if (w.dirty.size) {
      const cam = camera.position;
      const list = [...w.dirty].map((k) => {
        const sy = Math.floor(k / (w.nsx * w.nsz));
        const rem = k - sy * w.nsx * w.nsz;
        const sz = Math.floor(rem / w.nsx),
          sx = rem - sz * w.nsx;
        const d = ((sx + 0.5) * SECTION - cam.x) ** 2 + ((sz + 0.5) * SECTION - cam.z) ** 2;
        return { k, sx, sy, sz, d };
      });
      list.sort((a, b) => a.d - b.d);
      // nearest first; spread the rest over the next frames (~4 ms budget) so mining doesn't stutter
      const t0 = performance.now();
      for (let i = 0; i < Math.min(maxRebuild, list.length); i++) {
        if (i > 0 && performance.now() - t0 > 4) break;
        const s = list[i];
        this.buildSection(s.sx, s.sy, s.sz);
        w.dirty.delete(s.k);
      }
    }
    const rd2 = (this.renderDistance + SECTION) ** 2;
    const p = camera.position;
    for (const s of this.sections.values()) {
      const d2 = (s.center.x - p.x) ** 2 + (s.center.z - p.z) ** 2;
      const vis = d2 < rd2;
      for (const m of s.meshes) m.visible = vis;
    }
  }

  dispose() {
    for (const s of this.sections.values())
      for (const m of s.meshes) {
        m.geometry.dispose();
      }
    this.sections.clear();
    this.scene.remove(this.group);
    for (const m of Object.values(this.materials)) {
      if (m.map && m.map !== this.atlas.texture) m.map.dispose();
      m.dispose();
    }
  }
}
