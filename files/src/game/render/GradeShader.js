import * as THREE from 'three';

export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.1 },
    uContrast: { value: 1.05 },
    uLift: { value: new THREE.Vector3() },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uVignette: { value: 0.3 },
    uHurt: { value: 0 },
    uHeal: { value: 0 },
    uTime: { value: 0 },
    uGrain: { value: 0.035 },
    uChroma: { value: 0 },
    uFade: { value: 0 },
    uFadeColor: { value: new THREE.Color(0, 0, 0) },
    uSepia: { value: 0 },
    uDesat: { value: 0 },
    uActionTint: { value: new THREE.Vector4(0, 0, 0, 0) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation, uContrast, uVignette, uHurt, uHeal, uTime, uGrain, uChroma, uFade, uSepia, uDesat;
    uniform vec3 uLift, uGain, uFadeColor;
    uniform vec4 uActionTint;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      vec3 col;
      if (uChroma > 0.0) {
        vec2 off = c * uChroma * 0.02;
        col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      } else col = texture2D(tDiffuse, uv).rgb;
      col = col * uGain + uLift * (1.0 - col);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation * (1.0 - uDesat));
      col = (col - 0.5) * uContrast + 0.5;
      vec3 sep = vec3(l * 1.07, l * 0.95, l * 0.78);
      col = mix(col, sep, uSepia);
      float vig = smoothstep(0.85, 0.15, r2 * (1.0 + uVignette * 1.6));
      col *= mix(1.0, vig, clamp(uVignette * 1.4, 0.0, 1.0));
      col = mix(col, vec3(0.55, 0.0, 0.02), uHurt * smoothstep(0.05, 0.5, r2));
      col = mix(col, vec3(0.9, 0.75, 0.2), uHeal * smoothstep(0.1, 0.5, r2) * 0.5);
      col = mix(col, uActionTint.rgb, uActionTint.a * smoothstep(0.05, 0.45, r2));
      col += (rand(uv * 1000.0 + uTime) - 0.5) * uGrain;
      col = mix(col, uFadeColor, uFade);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};
