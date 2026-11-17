import clsx from "clsx";

/** ユーザーアイコン。画像が無いときは名前の1文字目を表示する */
export function Avatar({
  src,
  name,
  size = 40,
  className,
  ring,
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  return (
    <span
      className={clsx(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        ring ? "neu neu-sm p-[3px]" : "",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- 自前の /media 配信をそのまま使う
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="h-full w-full rounded-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full font-bold text-white"
          style={{
            fontSize: size * 0.42,
            background: `linear-gradient(140deg, color-mix(in oklab, var(--accent) 65%, white), var(--accent))`,
          }}
          aria-hidden="true"
        >
          {initial}
        </span>
      )}
    </span>
  );
}
