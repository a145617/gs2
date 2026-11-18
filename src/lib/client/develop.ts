"use client";

// WebGL2 による写真の「現像」（露出・ホワイトバランス・トーン・彩度・周辺減光・切り抜き・回転）。
// RAW はリニアな半精度データ、JPEG などは sRGB の画像として受け取り、同じ処理で仕上げる。

export type Adjustments = {
  /** 露出（EV, -3〜+3） */
  exposure: number;
  /** コントラスト（-1〜+1） */
  contrast: number;
  /** ハイライト（-1〜+1） */
  highlights: number;
  /** シャドウ（-1〜+1） */
  shadows: number;
  /** 色温度（-1 寒色〜+1 暖色） */
  temperature: number;
  /** 色かぶり補正（-1 緑〜+1 マゼンタ） */
  tint: number;
  /** 彩度（-1〜+1、-1 でモノクロ） */
  saturation: number;
  /** 周辺減光（0〜1） */
  vignette: number;
};

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  vignette: 0,
};

/** 回転（90°単位）と切り抜きの縦横比（null は元のまま） */
export type Geometry = { rotation: 0 | 1 | 2 | 3; aspect: number | null };

export type DevelopSource =
  | { kind: "bitmap"; image: TexImageSource; width: number; height: number }
  | { kind: "linear"; data: Uint16Array; width: number; height: number };

/** 回転・切り抜き後の出力サイズと、切り抜き範囲（回転後の画像に対する割合） */
export function computeOutput(src: { width: number; height: number }, geo: Geometry, maxLong: number) {
  const rw = geo.rotation % 2 === 1 ? src.height : src.width;
  const rh = geo.rotation % 2 === 1 ? src.width : src.height;
  const r = rw / rh;
  const a = geo.aspect ?? r;
  let cropW = 1;
  let cropH = 1;
  if (r > a) cropW = a / r;
  else cropH = r / a;
  const pw = rw * cropW;
  const ph = rh * cropH;
  const scale = Math.min(1, maxLong / Math.max(pw, ph));
  return { width: Math.max(1, Math.round(pw * scale)), height: Math.max(1, Math.round(ph * scale)), cropW, cropH };
}

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_out;
void main() {
  v_out = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_out;
out vec4 o;
uniform sampler2D u_tex;
uniform bool u_linear;
uniform vec2 u_crop;
uniform int u_rot;
uniform float u_exposure, u_contrast, u_highlights, u_shadows, u_temp, u_tint, u_sat, u_vignette, u_aspect;

vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// 0.75 までは変えず、それより明るい部分をなめらかに圧縮する（白飛びを抑える）
vec3 shoulder(vec3 x) {
  float s = 0.75;
  vec3 over = max(x - s, 0.0);
  return min(x, vec3(s)) + (1.0 - s) * (1.0 - exp(-over / (1.0 - s)));
}

void main() {
  vec2 f = vec2(0.5) + (v_out - 0.5) * u_crop;
  vec2 uv = u_rot == 0 ? f : u_rot == 1 ? vec2(f.y, 1.0 - f.x) : u_rot == 2 ? vec2(1.0 - f.x, 1.0 - f.y) : vec2(1.0 - f.y, f.x);
  vec3 c = texture(u_tex, uv).rgb;
  if (!u_linear) c = toLinear(c);
  c *= vec3(1.0 + 0.3 * u_temp, 1.0 - 0.2 * u_tint, 1.0 - 0.3 * u_temp);
  c *= exp2(u_exposure);
  if (u_linear || u_exposure > 0.0) c = shoulder(c);
  vec3 g = toSrgb(c);
  float L = luma(g);
  float sh = 1.0 - smoothstep(0.0, 0.55, L);
  float hl = smoothstep(0.45, 1.0, L);
  g += u_shadows * 0.45 * sh * (u_shadows > 0.0 ? (1.0 - g) : g);
  g += u_highlights * 0.45 * hl * (u_highlights > 0.0 ? (1.0 - g) : g);
  g = clamp(g, 0.0, 1.0);
  vec3 s = g * g * (3.0 - 2.0 * g);
  g = u_contrast >= 0.0 ? mix(g, s, u_contrast) : mix(g, vec3(0.5), -u_contrast * 0.5);
  g = mix(vec3(luma(g)), g, 1.0 + u_sat);
  vec2 d = (v_out - 0.5) * vec2(u_aspect, 1.0);
  float r = length(d) / length(vec2(u_aspect, 1.0) * 0.5);
  g *= 1.0 - u_vignette * smoothstep(0.45, 1.0, r) * 0.85;
  o = vec4(clamp(g, 0.0, 1.0), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
  return s;
}

export class Developer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private tex: WebGLTexture | null = null;
  private src: { width: number; height: number; linear: boolean } | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  static isSupported(): boolean {
    if (typeof document === "undefined") return false;
    try {
      return !!document.createElement("canvas").getContext("webgl2");
    } catch {
      return false;
    }
  }

  constructor(canvas: HTMLCanvasElement, opts: { preserve?: boolean } = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      preserveDrawingBuffer: !!opts.preserve,
      premultipliedAlpha: false,
      antialias: false,
    });
    if (!gl) throw new Error("WebGL2 に対応していません");
    this.gl = gl;
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link error");
    this.program = p;
    gl.useProgram(p);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(p, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    for (const n of [
      "u_tex", "u_linear", "u_crop", "u_rot", "u_exposure", "u_contrast", "u_highlights", "u_shadows",
      "u_temp", "u_tint", "u_sat", "u_vignette", "u_aspect",
    ]) {
      this.loc[n] = gl.getUniformLocation(p, n);
    }
  }

  get maxTextureSize(): number {
    return this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
  }

  setSource(src: DevelopSource) {
    const gl = this.gl;
    if (this.tex) gl.deleteTexture(this.tex);
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (src.kind === "linear") {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, src.width, src.height, 0, gl.RGBA, gl.HALF_FLOAT, src.data);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src.image);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.tex = tex;
    this.src = { width: src.width, height: src.height, linear: src.kind === "linear" };
  }

  /** 指定サイズで描画する */
  draw(adj: Adjustments, geo: Geometry, width: number, height: number) {
    if (!this.src) return;
    const gl = this.gl;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    const out = computeOutput(this.src, geo, Number.MAX_SAFE_INTEGER);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.uniform1i(this.loc.u_tex, 0);
    gl.uniform1i(this.loc.u_linear, this.src.linear ? 1 : 0);
    gl.uniform2f(this.loc.u_crop, out.cropW, out.cropH);
    gl.uniform1i(this.loc.u_rot, geo.rotation);
    gl.uniform1f(this.loc.u_exposure, adj.exposure);
    gl.uniform1f(this.loc.u_contrast, adj.contrast);
    gl.uniform1f(this.loc.u_highlights, adj.highlights);
    gl.uniform1f(this.loc.u_shadows, adj.shadows);
    gl.uniform1f(this.loc.u_temp, adj.temperature);
    gl.uniform1f(this.loc.u_tint, adj.tint);
    gl.uniform1f(this.loc.u_sat, adj.saturation);
    gl.uniform1f(this.loc.u_vignette, adj.vignette);
    gl.uniform1f(this.loc.u_aspect, width / height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  sourceSize() {
    return this.src ? { width: this.src.width, height: this.src.height } : null;
  }

  destroy() {
    const gl = this.gl;
    if (this.tex) gl.deleteTexture(this.tex);
    gl.deleteProgram(this.program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

/** 現像結果を JPEG にする（長辺 maxLong 以下、サイズが大きすぎれば画質を下げる） */
export async function exportDeveloped(
  src: DevelopSource,
  adj: Adjustments,
  geo: Geometry,
  maxLong = 2560,
  maxBytes = 3.8 * 1024 * 1024,
): Promise<{ blob: Blob; width: number; height: number }> {
  const canvas = document.createElement("canvas");
  const dev = new Developer(canvas, { preserve: true });
  try {
    dev.setSource(src);
    const out = computeOutput(src, geo, maxLong);
    dev.draw(adj, geo, out.width, out.height);
    for (const q of [0.92, 0.85, 0.75, 0.65]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
      if (!blob) throw new Error("画像を書き出せませんでした");
      if (blob.size <= maxBytes || q === 0.65) return { blob, width: out.width, height: out.height };
    }
    throw new Error("画像を書き出せませんでした");
  } finally {
    dev.destroy();
  }
}

/** WebGL2 が使えない環境向け: 現像せずに縮小だけして JPEG にする */
export async function exportPlain(image: CanvasImageSource & { width: number; height: number }, maxLong = 2560) {
  const scale = Math.min(1, maxLong / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  if (!blob) throw new Error("画像を書き出せませんでした");
  return { blob, width: canvas.width, height: canvas.height };
}

/** 画像ファイルを読み込み、長辺 maxLong 以下の ImageBitmap にする（撮影時の向きを反映） */
export async function loadBitmap(blob: Blob, maxLong = 4096): Promise<ImageBitmap> {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  if (Math.max(bmp.width, bmp.height) <= maxLong) return bmp;
  const scale = maxLong / Math.max(bmp.width, bmp.height);
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return createImageBitmap(canvas);
}
