import { Logo } from "@/components/shell/header";

export const metadata = { title: "オフライン" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo size={28} />
      <div className="neu flex max-w-sm flex-col gap-2 p-6">
        <p className="font-bold text-ink">オフラインです</p>
        <p className="text-sm text-ink-2">通信できる場所に移動してから、もう一度開いてください。</p>
      </div>
    </main>
  );
}
