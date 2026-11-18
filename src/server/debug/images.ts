import sharp from "sharp";

// デバッグ用のダミー画像（SVG を描いて JPEG / PNG にする）

/** 決まった順に値を出す乱数（同じ種なら同じ絵になる） */
export function seededRandom(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function hsl(h: number, s: number, l: number): string {
  // HSL → #rrggbb（SVG の描画系によっては hsl() を解釈しないため、16進数で渡す）
  const hh = (((h % 360) + 360) % 360) / 360;
  const ss = Math.max(0, Math.min(1, s / 100));
  const ll = Math.max(0, Math.min(1, l / 100));
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const ch = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const to = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(ch(hh + 1 / 3))}${to(ch(hh))}${to(ch(hh - 1 / 3))}`;
}

/** #rrggbb の色相（0〜360） */
export function hueOf(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 210;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

const W = 1200;
const H = 900;

/** 写真らしいダミーの風景（空・夜・ぼけ・海・静物・花） */
export async function demoPhoto(seed: number, baseHue: number): Promise<Buffer> {
  const rnd = seededRandom(seed * 7919 + 13);
  const h = baseHue + (rnd() - 0.5) * 70;
  const kind = Math.floor(rnd() * 6);
  let body = "";
  if (kind === 0) {
    // 空と丘
    body = `
      <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${hsl(h, 60, 42)}"/><stop offset="1" stop-color="${hsl(h + 25, 70, 82)}"/>
      </linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#sky)"/>
      <circle cx="${300 + rnd() * 600}" cy="${180 + rnd() * 200}" r="${60 + rnd() * 50}" fill="${hsl(h + 180, 90, 92)}" opacity="0.92"/>
      ${Array.from({ length: 4 }, () => `<ellipse cx="${rnd() * W}" cy="${80 + rnd() * 300}" rx="${120 + rnd() * 160}" ry="${26 + rnd() * 24}" fill="#ffffff" opacity="${0.35 + rnd() * 0.35}"/>`).join("")}
      <path d="M0 ${H * 0.72} Q ${W * 0.3} ${H * 0.58} ${W * 0.55} ${H * 0.7} T ${W} ${H * 0.66} V ${H} H 0 Z" fill="${hsl(h + 120, 30, 32)}"/>
      <path d="M0 ${H * 0.82} Q ${W * 0.4} ${H * 0.72} ${W} ${H * 0.84} V ${H} H 0 Z" fill="${hsl(h + 130, 28, 22)}"/>`;
  } else if (kind === 1) {
    // 夜空と月
    body = `
      <defs><linearGradient id="n" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${hsl(h, 50, 8)}"/><stop offset="1" stop-color="${hsl(h + 20, 45, 26)}"/>
      </linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#n)"/>
      ${Array.from({ length: 90 }, () => `<circle cx="${rnd() * W}" cy="${rnd() * H * 0.75}" r="${0.8 + rnd() * 2.2}" fill="#ffffff" opacity="${0.4 + rnd() * 0.6}"/>`).join("")}
      <circle cx="${250 + rnd() * 700}" cy="${150 + rnd() * 150}" r="70" fill="#fdf6d8"/>
      <rect y="${H * 0.86}" width="${W}" height="${H * 0.14}" fill="${hsl(h, 30, 6)}"/>`;
  } else if (kind === 2) {
    // 街の灯りのぼけ
    body = `
      <rect width="${W}" height="${H}" fill="${hsl(h, 40, 14)}"/>
      ${Array.from({ length: 34 }, () => `<circle cx="${rnd() * W}" cy="${rnd() * H}" r="${30 + rnd() * 110}" fill="${hsl(h + (rnd() - 0.5) * 120, 80, 60)}" opacity="${0.18 + rnd() * 0.35}"/>`).join("")}`;
  } else if (kind === 3) {
    // 海と水平線
    const sunX = 300 + rnd() * 600;
    body = `
      <defs>
        <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hsl(h + 30, 70, 62)}"/><stop offset="1" stop-color="${hsl(h + 10, 85, 80)}"/></linearGradient>
        <linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hsl(h + 190, 45, 40)}"/><stop offset="1" stop-color="${hsl(h + 200, 50, 18)}"/></linearGradient>
      </defs>
      <rect width="${W}" height="${H * 0.55}" fill="url(#s)"/>
      <circle cx="${sunX}" cy="${H * 0.48}" r="64" fill="${hsl(h + 40, 95, 88)}"/>
      <rect y="${H * 0.55}" width="${W}" height="${H * 0.45}" fill="url(#w)"/>
      ${Array.from({ length: 16 }, (_, i) => `<rect x="${sunX - 60 + rnd() * 30}" y="${H * 0.57 + i * 22}" width="${90 - i * 4}" height="5" rx="2" fill="${hsl(h + 40, 95, 85)}" opacity="${0.6 - i * 0.03}"/>`).join("")}`;
  } else if (kind === 4) {
    // 静物（重なる図形）
    body = `
      <rect width="${W}" height="${H}" fill="${hsl(h, 22, 86)}"/>
      <rect y="${H * 0.68}" width="${W}" height="${H * 0.32}" fill="${hsl(h + 20, 25, 70)}"/>
      ${Array.from({ length: 5 }, () => {
        const x = 150 + rnd() * 800;
        const r = 70 + rnd() * 90;
        return `<ellipse cx="${x}" cy="${H * 0.68 - r * 0.6}" rx="${r}" ry="${r * 1.1}" fill="${hsl(h + (rnd() - 0.5) * 160, 55, 50)}" opacity="0.9"/>
          <ellipse cx="${x + r * 0.2}" cy="${H * 0.69}" rx="${r * 0.9}" ry="${r * 0.15}" fill="#000000" opacity="0.12"/>`;
      }).join("")}`;
  } else {
    // 花
    body = `
      <rect width="${W}" height="${H}" fill="${hsl(h + 100, 35, 30)}"/>
      ${Array.from({ length: 7 }, () => {
        const cx = rnd() * W;
        const cy = rnd() * H;
        const r = 40 + rnd() * 50;
        const c = hsl(h + (rnd() - 0.5) * 60, 80, 66);
        const petals = Array.from({ length: 6 }, (_, k) => {
          const a = (k / 6) * Math.PI * 2;
          return `<ellipse cx="${cx + Math.cos(a) * r}" cy="${cy + Math.sin(a) * r}" rx="${r * 0.7}" ry="${r * 0.45}" transform="rotate(${(a * 180) / Math.PI} ${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r})" fill="${c}" opacity="0.9"/>`;
        }).join("");
        return `${petals}<circle cx="${cx}" cy="${cy}" r="${r * 0.4}" fill="${hsl(h + 50, 90, 60)}"/>`;
      }).join("")}`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

/** 指定の色が画面いっぱいに写った写真（イベントのマスを埋める確認用） */
export async function colorPhoto(hex: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <defs><radialGradient id="g" cx="0.4" cy="0.35" r="0.9">
      <stop offset="0" stop-color="${mix(hex, "#ffffff", 0.12)}"/><stop offset="1" stop-color="${mix(hex, "#000000", 0.12)}"/>
    </radialGradient></defs>
    <rect width="800" height="600" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

/** アイコン用の画像（グラデーションに人の形） */
export async function avatarImage(seed: number): Promise<Buffer> {
  const h = (seed * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${hsl(h, 70, 74)}"/><stop offset="1" stop-color="${hsl(h + 60, 55, 46)}"/>
    </linearGradient></defs>
    <rect width="320" height="320" fill="url(#g)"/>
    <circle cx="160" cy="128" r="60" fill="#ffffff" opacity="0.88"/>
    <ellipse cx="160" cy="300" rx="112" ry="92" fill="#ffffff" opacity="0.88"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function mix(hex: string, other: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex);
  const b = p(other);
  return `#${a
    .map((v, i) =>
      Math.round(v + (b[i] - v) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
