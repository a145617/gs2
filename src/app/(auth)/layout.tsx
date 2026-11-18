import { Logo } from "@/components/shell/header";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-5"
      style={{ paddingTop: "calc(var(--safe-top) + 32px)", paddingBottom: "calc(var(--safe-bottom) + 32px)" }}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={30} />
        <p className="font-display text-[15px] leading-relaxed text-ink-2">
          毎朝5時、ひとつのお題が届く。
          <br />
          日常のなかの、芸術のひとこまを。
        </p>
      </div>
      {children}
    </main>
  );
}
