import type { ReactNode } from "react";

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icon && <div className="neu neu-convex flex h-16 w-16 items-center justify-center rounded-full text-ink-3">{icon}</div>}
      <p className="font-bold text-ink-2">{title}</p>
      {children && <div className="text-sm text-ink-3">{children}</div>}
    </div>
  );
}
