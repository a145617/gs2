export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="読み込み中"
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${Math.max(2, size / 9)}px solid color-mix(in oklab, currentColor 22%, transparent)`,
        borderTopColor: "currentColor",
        animation: "spin 0.8s linear infinite",
      }}
    />
  );
}

export function PageSpinner({ label = "読み込み中…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-ink-3">
      <Spinner size={28} />
      <span className="text-sm">{label}</span>
    </div>
  );
}
