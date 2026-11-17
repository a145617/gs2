// お題ごとの「表示テンプレート」。投稿は、投稿した日のお題のテンプレートで表示される。

export const TEMPLATE_KEYS = [
  "window",
  "gallery",
  "film",
  "water",
  "splash",
  "dark",
  "washi",
  "kaleido",
  "instant",
  "prism",
  "monitor",
  "fog",
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export const TEMPLATES: Record<TemplateKey, { name: string; description: string; accent: string }> = {
  window: { name: "窓", description: "窓枠越しに眺める。ガラスの水滴や曇りを指で拭える", accent: "#4a8fd8" },
  gallery: { name: "額縁", description: "美術館の額に収め、スポットライトで照らす", accent: "#b8892d" },
  film: { name: "フィルム", description: "フィルムの粒子と光漏れで、記憶のように", accent: "#c9773a" },
  water: { name: "水面", description: "水面に映った写真。触れると波紋が広がる", accent: "#3f9a9a" },
  splash: { name: "色抽出", description: "お題の色だけを残し、ほかはモノクロに", accent: "#d64545" },
  dark: { name: "暗闇", description: "暗がりの中、指を置いた場所だけが照らされる", accent: "#3b3f8f" },
  washi: { name: "和紙", description: "和紙ににじむ写真と、縦書きの言葉", accent: "#8c8577" },
  kaleido: { name: "万華鏡", description: "写真から生まれる万華鏡の模様", accent: "#9b4fc0" },
  instant: { name: "チェキ", description: "紐に吊るしたインスタント写真。傾けると揺れる", accent: "#d9826a" },
  prism: { name: "プリズム", description: "光が分かれ、ガラスのように屈折する", accent: "#4fb0c9" },
  monitor: { name: "モニター", description: "走査線と色のにじみ。画面越しの世界", accent: "#3f8f6f" },
  fog: { name: "霧", description: "霧の向こうの一枚。指で拭うと見えてくる", accent: "#9a8fc0" },
};

export function isTemplateKey(v: unknown): v is TemplateKey {
  return typeof v === "string" && (TEMPLATE_KEYS as readonly string[]).includes(v);
}
