"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

// WebGL の効果（シェーダー）を写真にかけるキャンバス。
// 画面に見えている間だけ動かし、見えなくなったら止めて WebGL の資源を解放する（スマホでの負荷対策）。

export type EffectUniforms = Record<string, number | [number, number] | [number, number, number] | [number, number, number, number]>;

type Props = {
  src: string;
  /** フラグメントシェーダー（u_tex, u_time, u_res, u_pointer, u_touch, u_touchTime, u_aspect を利用可） */
  fragment: string;
  uniforms?: () => EffectUniforms;
  className?: string;
  /** 画像の縦横比（幅/高さ） */
  aspect: number;
  alt: string;
  /** 指で触れた位置を効果に使う */
  interactive?: boolean;
  /** 毎フレーム描き直す（false なら一度だけ描く） */
  animate?: boolean;
};

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const HEADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform float u_time;
uniform vec2 u_res;
uniform vec2 u_pointer;
uniform vec2 u_touch;
uniform float u_touchTime;
uniform float u_aspect;
`;

function supportsWebGL2() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

export function EffectCanvas({ src, fragment, uniforms, className, aspect, alt, interactive = true, animate = true }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const pointer = useRef<[number, number]>([0.5, 0.5]);
  const touch = useRef<{ p: [number, number]; t: number }>({ p: [-1, -1], t: -100 });
  // 効果の時刻の基準（触れた時刻と同じ基準で測る）
  const startRef = useRef(0);
  const uniformsRef = useRef(uniforms);
  useEffect(() => {
    uniformsRef.current = uniforms;
  }, [uniforms]);

  // 画面に入っているか
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => setVisible(e.some((x) => x.isIntersecting)), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || failed) return;
    const canvas = canvasRef.current;
    if (!canvas || !supportsWebGL2()) {
      const id = window.setTimeout(() => setFailed(true), 0);
      return () => window.clearTimeout(id);
    }
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false });
    if (!gl) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let disposed = false;
    const start = performance.now();
    startRef.current = start;

    const compile = (type: number, code: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, code);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    let program: WebGLProgram;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, HEADER + fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("link");
    } catch {
      const id = window.setTimeout(() => setFailed(true), 0);
      return () => window.clearTimeout(id);
    }
    gl.useProgram(program);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    const loc = (n: string) => gl.getUniformLocation(program, n);

    const img = new Image();
    img.decoding = "async";
    img.src = src;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const draw = () => {
      if (disposed) return;
      resize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      const t = (performance.now() - start) / 1000;
      gl.uniform1i(loc("u_tex"), 0);
      gl.uniform1f(loc("u_time"), t);
      gl.uniform2f(loc("u_res"), canvas.width, canvas.height);
      gl.uniform2f(loc("u_pointer"), pointer.current[0], pointer.current[1]);
      gl.uniform2f(loc("u_touch"), touch.current.p[0], touch.current.p[1]);
      gl.uniform1f(loc("u_touchTime"), t - touch.current.t);
      gl.uniform1f(loc("u_aspect"), canvas.width / canvas.height);
      const extra = uniformsRef.current?.() ?? {};
      for (const [k, v] of Object.entries(extra)) {
        const l = loc(k);
        if (!l) continue;
        if (typeof v === "number") gl.uniform1f(l, v);
        else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
        else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
        else gl.uniform4f(l, v[0], v[1], v[2], v[3]);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (animate && !reduce) raf = requestAnimationFrame(draw);
    };

    img.onload = () => {
      if (disposed) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
      draw();
    };
    img.onerror = () => setFailed(true);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      gl.deleteTexture(tex);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [visible, failed, src, fragment, animate]);

  function toUv(e: React.PointerEvent) {
    const r = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] as [number, number];
  }

  return (
    <div
      ref={wrapRef}
      className={clsx("relative overflow-hidden", className)}
      style={{ aspectRatio: String(aspect) }}
      onPointerMove={interactive ? (e) => (pointer.current = toUv(e)) : undefined}
      onPointerDown={
        interactive
          ? (e) => {
              const p = toUv(e);
              pointer.current = p;
              touch.current = { p, t: (performance.now() - startRef.current) / 1000 };
            }
          : undefined
      }
    >
      {/* 画像（WebGL が使えない環境や読み込み中はこれを表示） */}
      {/* eslint-disable-next-line @next/next/no-img-element -- 同一オリジンで配信する画像 */}
      <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      {!failed && visible && <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />}
    </div>
  );
}
