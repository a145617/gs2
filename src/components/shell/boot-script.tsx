// 最初の描画より前に、保存済みのテーマ（ライト/ダーク）と今日のアクセント色を反映する。
// こうしないと読み込み直後に色がちらつく（Next.js の「Preventing Flash」の方式）。
const code = `(function(){try{
var d=document.documentElement;
var t=localStorage.getItem("hk:theme");
if(t==="light"||t==="dark")d.setAttribute("data-theme",t);
var a=localStorage.getItem("hk:accent");
if(a&&/^#[0-9a-fA-F]{6}$/.test(a))d.style.setProperty("--accent",a);
}catch(e){}})();`;

export function BootScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}
