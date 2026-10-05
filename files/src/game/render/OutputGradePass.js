import { GLSL3, HalfFloatType, RawShaderMaterial, WebGLRenderTarget } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OutputShader } from 'three/addons/shaders/OutputShader.js';
import { GradeShader } from './GradeShader.js';

/** Output conversion and grading in one pass, with the original half-float intermediate precision. */
export class OutputGradePass extends OutputPass {
  constructor(gradeUniforms) {
    super();
    for (const [name, uniform] of Object.entries(gradeUniforms)) {
      if (name !== 'tDiffuse') this.uniforms[name] = uniform;
    }
    this.uniforms.uRoundTowardZero = { value: false };
    this._roundingKnown = false;
    this.material.glslVersion = GLSL3;
    this.material.vertexShader = OutputShader.vertexShader
      .replaceAll('attribute ', 'in ')
      .replaceAll('varying ', 'out ');
    const output = OutputShader.fragmentShader
      .replace('uniform sampler2D tDiffuse;', '')
      .replace('varying vec2 vUv;', '')
      .replace('void main() {', 'vec4 convertOutput(vec2 uv) { vec4 converted;')
      .replaceAll('gl_FragColor', 'converted')
      .replace('tDiffuse, vUv', 'tDiffuse, uv');
    const end = output.lastIndexOf('}');
    const conversion = output.slice(0, end) + 'return converted;\n}' + output.slice(end + 1);
    this.material.fragmentShader = (
      'precision highp float;\nprecision highp int;\nout vec4 fragColor;\n' +
      GradeShader.fragmentShader
        .replace(
          'void main()',
          conversion +
            `
        uniform bool uRoundTowardZero;
        vec2 halfRound(vec2 value) {
          uint bits = packHalf2x16(value);
          if (uRoundTowardZero) {
            vec2 rounded = unpackHalf2x16(bits);
            bits -= uint(abs(rounded.x) > abs(value.x));
            bits -= uint(abs(rounded.y) > abs(value.y)) << 16u;
          }
          return unpackHalf2x16(bits);
        }
        void main()`,
        )
        .replace(
          '} else col = texture2D(tDiffuse, uv).rgb;',
          `} else {
          col = convertOutput(uv).rgb;
          // Match the RGBA16F buffer that OutputPass previously wrote before grading.
          col.rg = halfRound(col.rg);
          col.b = halfRound(vec2(col.b, 0.0)).x;
        }`,
        )
    )
      .replaceAll('varying ', 'in ')
      .replaceAll('texture2D(', 'texture(')
      .replaceAll('gl_FragColor', 'fragColor');
  }
  render(renderer, writeBuffer, readBuffer) {
    if (!this._roundingKnown) {
      this.uniforms.uRoundTowardZero.value = detectHalfFloatRounding(renderer);
      this._roundingKnown = true;
    }
    super.render(renderer, writeBuffer, readBuffer);
  }
}

/** Drivers may truncate RGBA16F writes or round to nearest. Probe once, never during normal frames. */
function detectHalfFloatRounding(renderer) {
  const previous = renderer.getRenderTarget();
  const half = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  const bytes = new WebGLRenderTarget(1, 1, { depthBuffer: false });
  const material = new RawShaderMaterial({
    vertexShader: OutputShader.vertexShader,
    fragmentShader: `precision highp float;
      uniform sampler2D probe; uniform bool compare; varying vec2 vUv;
      void main() {
        gl_FragColor = compare ? vec4(texture2D(probe, vUv).r > 1.0006 ? 1.0 : 0.0) : vec4(1.0006);
      }`,
    uniforms: { probe: { value: null }, compare: { value: false } },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new FullScreenQuad(material);
  try {
    renderer.setRenderTarget(half);
    quad.render(renderer);
    material.uniforms.probe.value = half.texture;
    material.uniforms.compare.value = true;
    renderer.setRenderTarget(bytes);
    quad.render(renderer);
    const pixel = new Uint8Array(4);
    renderer.readRenderTargetPixels(bytes, 0, 0, 1, 1, pixel);
    return pixel[0] === 0;
  } finally {
    renderer.setRenderTarget(previous);
    half.dispose();
    bytes.dispose();
    material.dispose();
    quad.dispose();
  }
}
