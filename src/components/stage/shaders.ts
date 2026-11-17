// お題ごとの表示テンプレートで使う WebGL のシェーダー（EffectCanvas のヘッダーに続けて連結される）

/** 水面: 触れた所から波紋が広がり、全体もゆっくり揺らぐ */
export const WATER = `
void main() {
  vec2 uv = v_uv;
  float t = u_time;
  vec2 p = (uv - 0.5) * vec2(u_aspect, 1.0);
  // ゆるやかなうねり
  vec2 off = vec2(sin(p.y * 18.0 + t * 1.4), cos(p.x * 16.0 + t * 1.1)) * 0.0035;
  // 触れた所の波紋
  if (u_touch.x >= 0.0) {
    vec2 tp = (u_touch - 0.5) * vec2(u_aspect, 1.0);
    float d = distance(p, tp);
    float age = u_touchTime;
    float ring = sin(d * 70.0 - age * 9.0) * exp(-d * 4.0) * exp(-age * 0.9);
    off += normalize(p - tp + 1e-5) * ring * 0.018;
  }
  vec3 c = texture(u_tex, uv + off).rgb;
  // 水の色と光の反射
  float spec = pow(max(0.0, sin((uv.x + uv.y) * 9.0 + t * 0.8 + off.x * 400.0)), 18.0) * 0.18;
  c = mix(c, c * vec3(0.92, 1.0, 1.04), 0.35) + spec;
  o = vec4(c, 1.0);
}`;

/** 色抽出: お題の色に近い部分だけ色を残す。触れた所は元の色が戻る */
export const SPLASH = `
uniform vec3 u_target;
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  vec3 hsv = rgb2hsv(c);
  vec3 th = rgb2hsv(u_target);
  float dh = abs(hsv.x - th.x);
  dh = min(dh, 1.0 - dh);
  float keep = (1.0 - smoothstep(0.04, 0.11, dh)) * smoothstep(0.12, 0.3, hsv.y);
  float g = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 mono = vec3(g) * 1.02;
  // 触れている所は元の色に戻る
  float reveal = 0.0;
  if (u_touch.x >= 0.0) {
    vec2 a = vec2(u_aspect, 1.0);
    reveal = (1.0 - smoothstep(0.12, 0.2, distance(v_uv * a, u_touch * a))) * exp(-u_touchTime * 0.5);
  }
  float pulse = 0.85 + 0.15 * sin(u_time * 1.5);
  vec3 col = mix(mono, c * mix(1.0, 1.12, pulse), max(keep, reveal));
  o = vec4(col, 1.0);
}`;

/** 万華鏡: 写真の一部を6回対称に折り返し、ゆっくり回る。中央の円には元の写真 */
export const KALEIDO = `
void main() {
  vec2 p = (v_uv - 0.5) * vec2(u_aspect, 1.0);
  float r = length(p);
  float a = atan(p.y, p.x) + u_time * 0.12 + (u_pointer.x - 0.5) * 1.2;
  float seg = 6.2831853 / 6.0;
  a = mod(a, seg);
  a = abs(a - seg * 0.5);
  vec2 q = vec2(cos(a), sin(a)) * r;
  vec2 uv = q * 0.9 + vec2(0.5 + 0.05 * sin(u_time * 0.3), 0.5);
  vec3 k = texture(u_tex, uv).rgb;
  vec3 orig = texture(u_tex, v_uv).rgb;
  float inner = 1.0 - smoothstep(0.28, 0.3, r);
  float ring = smoothstep(0.285, 0.3, r) * (1.0 - smoothstep(0.3, 0.315, r));
  vec3 col = mix(k * 0.95, orig, inner) + ring * 0.6;
  o = vec4(col, 1.0);
}`;

/** プリズム: 端ほど色が分かれ、指（傾き）に合わせて虹色の光の帯が動く */
export const PRISM = `
void main() {
  vec2 uv = v_uv;
  vec2 dir = uv - 0.5;
  float amt = 0.006 + 0.012 * length(dir);
  vec3 c;
  c.r = texture(u_tex, uv + dir * amt).r;
  c.g = texture(u_tex, uv).g;
  c.b = texture(u_tex, uv - dir * amt).b;
  // 光の帯
  float band = (uv.x * 0.8 + uv.y * 0.6) - (u_pointer.x * 0.8 + u_pointer.y * 0.6) + 0.1 * sin(u_time * 0.7);
  float w = exp(-pow(band * 6.0, 2.0));
  vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (band * 3.0 + vec3(0.0, 0.33, 0.67)));
  c += rainbow * w * 0.35;
  // ガラスの面の反射
  c += smoothstep(0.985, 1.0, sin((uv.x - uv.y) * 40.0 + u_time)) * 0.08;
  o = vec4(c, 1.0);
}`;

/** モニター: 樽型のゆがみ・走査線・RGBのにじみ・ちらつき */
export const MONITOR = `
void main() {
  vec2 uv = v_uv * 2.0 - 1.0;
  uv *= 1.0 + 0.06 * dot(uv, uv);
  uv = uv * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { o = vec4(0.02, 0.03, 0.03, 1.0); return; }
  float s = 0.0018;
  vec3 c = vec3(texture(u_tex, uv + vec2(s, 0.0)).r, texture(u_tex, uv).g, texture(u_tex, uv - vec2(s, 0.0)).b);
  float scan = 0.82 + 0.18 * sin(uv.y * u_res.y * 1.6);
  float mask = 0.9 + 0.1 * sin(uv.x * u_res.x * 2.1);
  float flicker = 0.97 + 0.03 * sin(u_time * 50.0);
  float roll = smoothstep(0.0, 0.02, abs(fract(uv.y - u_time * 0.08) - 0.5)) * 0.08 + 0.92;
  vec2 v = uv - 0.5;
  float vig = 1.0 - dot(v, v) * 1.2;
  c = c * scan * mask * flicker * roll * vig * 1.1;
  o = vec4(c, 1.0);
}`;
