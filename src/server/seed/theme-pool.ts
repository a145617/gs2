import type { TemplateKey } from "@/lib/templates";

/** 最初に用意しておくお題の候補（抽象的なお題 × 表示テンプレート） */
export const DEFAULT_THEME_POOL: { title: string; description: string; template: TemplateKey; accent: string }[] = [
  // 窓
  { title: "空", description: "見上げた先にある、今日だけの色。", template: "window", accent: "#4a8fd8" },
  { title: "雨", description: "濡れた街、しずく、雨の気配。", template: "window", accent: "#5b7fa6" },
  { title: "見上げる", description: "いつもより少しだけ、顔を上げて。", template: "window", accent: "#5a9be6" },
  { title: "窓の外", description: "内側から眺める、外の世界。", template: "window", accent: "#6b9ac4" },
  { title: "雲", description: "かたちを変え続けるもの。", template: "window", accent: "#7f9fd0" },
  // 額縁
  { title: "美しいもの", description: "あなたが「美しい」と感じた瞬間を。", template: "gallery", accent: "#b8892d" },
  { title: "古いもの", description: "時間を重ねたものの表情。", template: "gallery", accent: "#9c6b3c" },
  { title: "手仕事", description: "人の手がつくったもの。", template: "gallery", accent: "#a8743a" },
  { title: "名もなき芸術", description: "偶然うまれた、誰の作品でもないアート。", template: "gallery", accent: "#c08f3e" },
  { title: "静物", description: "動かないものの、静かな存在感。", template: "gallery", accent: "#8f6a43" },
  // フィルム
  { title: "懐かしい", description: "胸の奥がふっとあたたかくなるもの。", template: "film", accent: "#c9773a" },
  { title: "記憶", description: "覚えておきたい、いまの景色。", template: "film", accent: "#b9664a" },
  { title: "時間", description: "流れていくもの、刻まれるもの。", template: "film", accent: "#a8683d" },
  { title: "帰り道", description: "一日の終わりに見る風景。", template: "film", accent: "#d0804a" },
  { title: "いつもの場所", description: "変わらずそこにある日常。", template: "film", accent: "#b47a52" },
  // 水面
  { title: "落ち着く", description: "心がしずかになる場所や色。", template: "water", accent: "#3f9a9a" },
  { title: "静けさ", description: "音のない時間を写す。", template: "water", accent: "#4f8f9f" },
  { title: "揺らぎ", description: "ゆれる、ゆらめく、たゆたう。", template: "water", accent: "#3a8fb0" },
  { title: "水", description: "流れ、溜まり、きらめく水。", template: "water", accent: "#2f8fc0" },
  { title: "映り込み", description: "何かに映った、もうひとつの世界。", template: "water", accent: "#4c86a8" },
  // 色抽出
  { title: "赤いもの", description: "目に飛び込んでくる赤を探して。", template: "splash", accent: "#d64545" },
  { title: "青いもの", description: "身の回りの青を探して。", template: "splash", accent: "#2f6fd6" },
  { title: "黄色いもの", description: "光のような黄色。", template: "splash", accent: "#e0b02e" },
  { title: "緑のもの", description: "息づく緑。", template: "splash", accent: "#3f9b5a" },
  { title: "紫", description: "少し不思議な紫色。", template: "splash", accent: "#8a5cc7" },
  { title: "オレンジ", description: "あたたかなオレンジ色。", template: "splash", accent: "#e8833a" },
  // 暗闇
  { title: "夜", description: "夜にしか見えない景色。", template: "dark", accent: "#3b3f8f" },
  { title: "光と影", description: "光があるから生まれる影。", template: "dark", accent: "#5a5f9e" },
  { title: "灯り", description: "暗がりにともる、ちいさな光。", template: "dark", accent: "#c98a2e" },
  { title: "秘密", description: "こっそり見つけたもの。", template: "dark", accent: "#4b3f7a" },
  { title: "影", description: "影そのものを主役に。", template: "dark", accent: "#4a5068" },
  // 和紙
  { title: "余白", description: "何もない部分が語るもの。", template: "washi", accent: "#8c8577" },
  { title: "季節の気配", description: "移ろう季節のしるし。", template: "washi", accent: "#a0705a" },
  { title: "和", description: "日本らしさを感じるもの。", template: "washi", accent: "#b0413e" },
  { title: "風", description: "目に見えない風を写す。", template: "washi", accent: "#7a9a8a" },
  { title: "一輪", description: "たったひとつの、花やもの。", template: "washi", accent: "#b05a7a" },
  // 万華鏡
  { title: "繰り返し", description: "くり返される形やリズム。", template: "kaleido", accent: "#9b4fc0" },
  { title: "模様", description: "身の回りのパターン。", template: "kaleido", accent: "#c04f8f" },
  { title: "丸いもの", description: "まるい、まあるい。", template: "kaleido", accent: "#d0627a" },
  { title: "対称", description: "左右、上下、鏡合わせ。", template: "kaleido", accent: "#7f56d9" },
  { title: "幾何学", description: "線と面がつくる形。", template: "kaleido", accent: "#5a5fd6" },
  // チェキ
  { title: "日常", description: "いつもの、なんでもない一枚。", template: "instant", accent: "#d9826a" },
  { title: "小さな幸せ", description: "ささやかな「いいな」。", template: "instant", accent: "#e08a8a" },
  { title: "温もり", description: "あたたかさを感じるもの。", template: "instant", accent: "#d6775a" },
  { title: "ごはん", description: "今日のおいしい時間。", template: "instant", accent: "#d9963a" },
  { title: "手", description: "手が語る物語。", template: "instant", accent: "#c97b6b" },
  // プリズム
  { title: "透明", description: "透けて見える、向こう側。", template: "prism", accent: "#4fb0c9" },
  { title: "反射", description: "光がはね返る瞬間。", template: "prism", accent: "#5aa0d8" },
  { title: "境界", description: "ここと、むこうの境目。", template: "prism", accent: "#6a8fd0" },
  { title: "ガラス", description: "ガラス越しの世界。", template: "prism", accent: "#4aa8b8" },
  { title: "きらめき", description: "一瞬の光。", template: "prism", accent: "#7a9fe0" },
  // モニター
  { title: "街", description: "街の表情を切り取る。", template: "monitor", accent: "#3f8f6f" },
  { title: "機械", description: "機械や道具のかたち。", template: "monitor", accent: "#4f6f8f" },
  { title: "新しいもの", description: "はじめて見た、新しいもの。", template: "monitor", accent: "#2f9f8f" },
  { title: "文字", description: "看板、標識、街の文字。", template: "monitor", accent: "#5f7f3f" },
  { title: "合図", description: "サイン、しるし、知らせるもの。", template: "monitor", accent: "#d0503f" },
  // 霧
  { title: "柔らかい", description: "ふんわり、やわらかいもの。", template: "fog", accent: "#9a8fc0" },
  { title: "ぼんやり", description: "ピントの外側にある美しさ。", template: "fog", accent: "#8f9ab0" },
  { title: "朝", description: "一日のはじまりの光。", template: "fog", accent: "#c0a06a" },
  { title: "夢", description: "夢の中のような景色。", template: "fog", accent: "#9a7fc8" },
  { title: "遠く", description: "遠くにあるもの、遠くへ続くもの。", template: "fog", accent: "#7f9ab8" },
];
