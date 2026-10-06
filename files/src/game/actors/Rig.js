import * as THREE from 'three';

/** One model pixel in world units (a 32-pixel-tall biped is 1.875 blocks). */
export const PX = 0.9375 / 16;

/**
 * Character material: Lambert + skinning + emissive map, with rim light, hit flash and dissolve.
 */
export function createCharacterMaterial(map, emissiveMap, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({
    map,
    emissiveMap,
    emissive: new THREE.Color(
      opts.emissiveIntensity ?? 1.0,
      opts.emissiveIntensity ?? 1.0,
      opts.emissiveIntensity ?? 1.0,
    ),
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    transparent: false,
  });
  const u = {
    uRim: {
      value: new THREE.Color(opts.rim ?? 0x8fb4ff).multiplyScalar((opts.rimStrength ?? 0.3) * 0.5),
    },
    uFlash: { value: new THREE.Vector4(1, 1, 1, 0) },
    uTint: { value: new THREE.Vector4(1, 0.2, 0.2, 0) },
    uGhost: { value: 0 },
  };
  mat.userData.u = u;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uRim;\nuniform vec4 uFlash;\nuniform vec4 uTint;\nuniform float uGhost;',
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        {
          vec3 vd = normalize(vViewPosition);
          float rim = pow(1.0 - clamp(abs(dot(normal, vd)), 0.0, 1.0), 2.5);
          outgoingLight += uRim * rim;
          outgoingLight = mix(outgoingLight, uTint.rgb * max(0.35, dot(outgoingLight, vec3(0.33))), uTint.a);
          outgoingLight = mix(outgoingLight, uFlash.rgb, uFlash.a);
          if (uGhost > 0.0) {
            outgoingLight = mix(outgoingLight, vec3(0.4, 0.8, 1.0) * (0.6 + rim * 1.8), uGhost);
          }
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'character';
  return mat;
}

/**
 * Build a skinned box rig.
 * spec = {
 *   tex: { w, h },
 *   bones: [{ name, parent, pivot: [x,y,z] (model px) }],
 *   boxes: [{ bone, from:[x,y,z], size:[w,h,d], uv:[u,v], inflate?, bend?: { lower: boneName, at: y }, rot?: [rx,ry,rz], origin?: [x,y,z], hidden?: faces[] }]
 * }
 * canvases: { color: HTMLCanvasElement, emissive: HTMLCanvasElement }
 */
export function buildRig(spec, canvases, opts = {}) {
  const scale = (opts.scale ?? 1) * PX;
  const boneList = [];
  const bones = {};
  for (const b of spec.bones) {
    const bone = new THREE.Bone();
    bone.name = b.name;
    const parent = b.parent ? spec.bones.find((p) => p.name === b.parent) : null;
    const pp = parent ? parent.pivot : [0, 0, 0];
    bone.position.set(
      (b.pivot[0] - pp[0]) * scale,
      (b.pivot[1] - pp[1]) * scale,
      (b.pivot[2] - pp[2]) * scale,
    );
    bone.userData.rest = bone.position.clone();
    bones[b.name] = bone;
    boneList.push(bone);
    if (parent) bones[b.parent].add(bone);
  }
  const boneIndex = Object.fromEntries(boneList.map((b, i) => [b.name, i]));

  const pos = [],
    nrm = [],
    uv = [],
    si = [],
    sw = [],
    idx = [];
  const TW = spec.tex.w,
    TH = spec.tex.h;
  const rotM = new THREE.Matrix4();
  const tmpV = new THREE.Vector3();
  const tmpN = new THREE.Vector3();

  for (const box of spec.boxes) {
    const [fx, fy, fz] = box.from;
    const [w, h, d] = box.size;
    const inf = box.inflate ?? 0;
    const X0 = fx - inf,
      X1 = fx + w + inf,
      Y0 = fy - inf,
      Y1 = fy + h + inf,
      Z0 = fz - inf,
      Z1 = fz + d + inf;
    const [u, v] = box.uv;
    const upper = boneIndex[box.bone];
    if (upper == null) throw new Error('unknown bone ' + box.bone);
    const lower = box.bend ? boneIndex[box.bend.lower] : upper;
    const jy = box.bend ? box.bend.at : 0;
    const blend = box.bend?.blend ?? 1;
    let hasRot = false;
    if (box.rot) {
      hasRot = true;
      const o = box.origin ?? [fx + w / 2, fy + h / 2, fz + d / 2];
      rotM
        .makeTranslation(o[0], o[1], o[2])
        .multiply(
          new THREE.Matrix4().makeRotationFromEuler(
            new THREE.Euler(box.rot[0], box.rot[1], box.rot[2], 'XYZ'),
          ),
        )
        .multiply(new THREE.Matrix4().makeTranslation(-o[0], -o[1], -o[2]));
    }
    const mirror = !!box.mirror;
    // uv rects in px (x, y, w, h)
    const R = {
      top: [u + d, v, w, d],
      bottom: [u + d + w, v, w, d],
      right: [u, v + d, d, h],
      front: [u + d, v + d, w, h],
      left: [u + d + w, v + d, d, h],
      back: [u + 2 * d + w, v + d, w, h],
    };
    if (mirror) [R.right, R.left] = [R.left, R.right];
    const faces = [
      {
        k: 'front',
        n: [0, 0, 1],
        c: [
          [X0, Y1, Z1],
          [X1, Y1, Z1],
          [X1, Y0, Z1],
          [X0, Y0, Z1],
        ],
        side: true,
      },
      {
        k: 'back',
        n: [0, 0, -1],
        c: [
          [X1, Y1, Z0],
          [X0, Y1, Z0],
          [X0, Y0, Z0],
          [X1, Y0, Z0],
        ],
        side: true,
      },
      {
        k: 'right',
        n: [-1, 0, 0],
        c: [
          [X0, Y1, Z0],
          [X0, Y1, Z1],
          [X0, Y0, Z1],
          [X0, Y0, Z0],
        ],
        side: true,
      },
      {
        k: 'left',
        n: [1, 0, 0],
        c: [
          [X1, Y1, Z1],
          [X1, Y1, Z0],
          [X1, Y0, Z0],
          [X1, Y0, Z1],
        ],
        side: true,
      },
      {
        k: 'top',
        n: [0, 1, 0],
        c: [
          [X0, Y1, Z0],
          [X1, Y1, Z0],
          [X1, Y1, Z1],
          [X0, Y1, Z1],
        ],
      },
      {
        k: 'bottom',
        n: [0, -1, 0],
        c: [
          [X0, Y0, Z1],
          [X1, Y0, Z1],
          [X1, Y0, Z0],
          [X0, Y0, Z0],
        ],
      },
    ];
    for (const f of faces) {
      if (box.hidden?.includes(f.k)) continue;
      const [rx, ry, rw, rh] = R[f.k];
      if (rw === 0 || rh === 0) continue;
      let u0 = rx / TW,
        u1 = (rx + rw) / TW;
      if (mirror) [u0, u1] = [u1, u0];
      const vTop = 1 - ry / TH,
        vBot = 1 - (ry + rh) / TH;
      // rows for side faces (subdivided at the bend)
      const rows =
        f.side && box.bend
          ? [Y1, jy + blend, jy, jy - blend, Y0].filter(
              (y, i, a) => y <= Y1 && y >= Y0 && (i === 0 || y !== a[i - 1]),
            )
          : null;
      const emit = (p, n, tu, tv, wy) => {
        tmpV.set(p[0], p[1], p[2]);
        tmpN.set(n[0], n[1], n[2]);
        if (hasRot) {
          tmpV.applyMatrix4(rotM);
          tmpN.transformDirection(rotM);
        }
        pos.push(tmpV.x * scale, tmpV.y * scale, tmpV.z * scale);
        nrm.push(tmpN.x, tmpN.y, tmpN.z);
        uv.push(tu, tv);
        let t = 1;
        if (box.bend) t = Math.min(1, Math.max(0, (wy - (jy - blend)) / (2 * blend)));
        si.push(upper, lower, 0, 0);
        sw.push(t, 1 - t, 0, 0);
        return pos.length / 3 - 1;
      };
      if (!rows) {
        const wys =
          f.k === 'top'
            ? [Y1, Y1, Y1, Y1]
            : f.k === 'bottom'
              ? [Y0, Y0, Y0, Y0]
              : f.c.map((c) => c[1]);
        const uvs = [
          [u0, vTop],
          [u1, vTop],
          [u1, vBot],
          [u0, vBot],
        ];
        const ids = f.c.map((c, i) => emit(c, f.n, uvs[i][0], uvs[i][1], wys[i]));
        idx.push(ids[0], ids[3], ids[2], ids[0], ids[2], ids[1]);
      } else {
        // TL, TR at Y1; BR, BL at Y0 -> interpolate each row
        const L = [f.c[0], f.c[3]],
          Rr = [f.c[1], f.c[2]];
        const at = (pair, y) => {
          const t = (Y1 - y) / (Y1 - Y0);
          return [
            pair[0][0] + (pair[1][0] - pair[0][0]) * t,
            y,
            pair[0][2] + (pair[1][2] - pair[0][2]) * t,
          ];
        };
        let prev = null;
        for (const y of rows) {
          const tv = vTop + (vBot - vTop) * ((Y1 - y) / (Y1 - Y0));
          const a = emit(at(L, y), f.n, u0, tv, y);
          const b = emit(at(Rr, y), f.n, u1, tv, y);
          if (prev) idx.push(prev[0], a, b, prev[0], b, prev[1]);
          prev = [a, b];
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  const map = canvasTex(canvases.color);
  const emap = canvasTex(canvases.emissive);
  const material = createCharacterMaterial(map, emap, opts);
  const mesh = new THREE.SkinnedMesh(geo, material);
  const root = bones[spec.bones[0].name];
  mesh.add(root);
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(boneList);
  mesh.bind(skeleton);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  for (const b of boneList) b.userData.restQ = b.quaternion.clone();
  return { mesh, bones, skeleton, material, scale, spec };
}

export function canvasTex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/* ------------------------------------------------------------------ */
/* Biped (box-character layout on a 128x64 sheet)                    */
/* ------------------------------------------------------------------ */
export function bipedSpec({
  slim = false,
  wide = false,
  tall = 0,
  extras = [],
  extraBones = [],
  noOuter = false,
  thin = false,
  eyeRow = 4,
} = {}) {
  const aw = thin ? 2 : slim ? 3 : 4; // arm width
  const lw = thin ? 2 : 4;
  const tw = wide ? 10 : 8; // torso width
  const hx = tw / 2; // half torso
  const legY = 12 + tall; // hip height
  const bones = [
    { name: 'root', parent: null, pivot: [0, 0, 0] },
    { name: 'hips', parent: 'root', pivot: [0, legY, 0] },
    { name: 'spine', parent: 'hips', pivot: [0, legY, 0] },
    { name: 'chest', parent: 'spine', pivot: [0, legY + 6, 0] },
    { name: 'head', parent: 'chest', pivot: [0, legY + 12, 0] },
    { name: 'lids', parent: 'head', pivot: [0, legY + 20 - eyeRow, 4.05] },
    { name: 'armR', parent: 'chest', pivot: [-hx - aw / 2 + (thin ? 0 : 0), legY + 10, 0] },
    { name: 'foreR', parent: 'armR', pivot: [-hx - aw / 2, legY + 6, 0] },
    { name: 'handR', parent: 'foreR', pivot: [-hx - aw / 2, legY + 1, 0] },
    { name: 'armL', parent: 'chest', pivot: [hx + aw / 2, legY + 10, 0] },
    { name: 'foreL', parent: 'armL', pivot: [hx + aw / 2, legY + 6, 0] },
    { name: 'handL', parent: 'foreL', pivot: [hx + aw / 2, legY + 1, 0] },
    { name: 'legR', parent: 'hips', pivot: [-lw / 2, legY, 0] },
    { name: 'shinR', parent: 'legR', pivot: [-lw / 2, legY / 2, 0] },
    { name: 'legL', parent: 'hips', pivot: [lw / 2, legY, 0] },
    { name: 'shinL', parent: 'legL', pivot: [lw / 2, legY / 2, 0] },
    { name: 'back', parent: 'chest', pivot: [0, legY + 11, -2] },
    ...extraBones,
  ];
  const Y = legY;
  const boxes = [
    // head
    { bone: 'head', from: [-4, Y + 12, -4], size: [8, 8, 8], uv: [0, 0] },
    // torso bends between chest (upper) and spine (lower)
    {
      bone: 'chest',
      from: [-hx, Y, -2],
      size: [tw, 12, 4],
      uv: [16, 16],
      bend: { lower: 'spine', at: Y + 6, blend: 1.5 },
    },
    // right arm (-X)
    {
      bone: 'armR',
      from: [-hx - aw, Y, -2],
      size: [aw, 12, aw === 2 ? 2 : 4],
      uv: [40, 16],
      bend: { lower: 'foreR', at: Y + 6 },
    },
    // left arm (+X)
    {
      bone: 'armL',
      from: [hx, Y, -2],
      size: [aw, 12, aw === 2 ? 2 : 4],
      uv: [32, 48],
      bend: { lower: 'foreL', at: Y + 6 },
    },
    // legs
    {
      bone: 'legR',
      from: [-lw, 0, -2],
      size: [lw, Y, lw === 2 ? 2 : 4],
      uv: [0, 16],
      bend: { lower: 'shinR', at: Y / 2 },
    },
    {
      bone: 'legL',
      from: [0, 0, -2],
      size: [lw, Y, lw === 2 ? 2 : 4],
      uv: [16, 48],
      bend: { lower: 'shinL', at: Y / 2 },
    },
  ];
  if (thin) {
    boxes[2].from = [-hx - 2, Y, -1];
    boxes[3].from = [hx, Y, -1];
    boxes[4].from = [-3, 0, -1];
    boxes[5].from = [1, 0, -1];
  }
  if (!noOuter) {
    boxes.push(
      { bone: 'head', from: [-4, Y + 12, -4], size: [8, 8, 8], uv: [32, 0], inflate: 0.5 },
      {
        bone: 'chest',
        from: [-hx, Y, -2],
        size: [tw, 12, 4],
        uv: [16, 32],
        inflate: 0.25,
        bend: { lower: 'spine', at: Y + 6, blend: 1.5 },
      },
      {
        bone: 'armR',
        from: [-hx - aw, Y, -2],
        size: [aw, 12, 4],
        uv: [40, 32],
        inflate: 0.25,
        bend: { lower: 'foreR', at: Y + 6 },
      },
      {
        bone: 'armL',
        from: [hx, Y, -2],
        size: [aw, 12, 4],
        uv: [48, 48],
        inflate: 0.25,
        bend: { lower: 'foreL', at: Y + 6 },
      },
      {
        bone: 'legR',
        from: [-lw, 0, -2],
        size: [lw, Y, 4],
        uv: [0, 32],
        inflate: 0.25,
        bend: { lower: 'shinR', at: Y / 2 },
      },
      {
        bone: 'legL',
        from: [0, 0, -2],
        size: [lw, Y, 4],
        uv: [0, 48],
        inflate: 0.25,
        bend: { lower: 'shinL', at: Y / 2 },
      },
    );
  }
  // eyelids: thin boxes in front of the eyes (texture region 64..,60 filled with skin tone by painters)
  boxes.push(
    {
      bone: 'lids',
      from: [-3, Y + 19 - eyeRow, 4.02],
      size: [2, 1, 0],
      uv: [120, 60],
      hidden: ['back'],
    },
    {
      bone: 'lids',
      from: [1, Y + 19 - eyeRow, 4.02],
      size: [2, 1, 0],
      uv: [120, 60],
      hidden: ['back'],
    },
  );
  boxes.push(...extras);
  return { tex: { w: 128, h: 64 }, bones, boxes, legY: Y, torsoHalf: hx, armW: aw };
}
