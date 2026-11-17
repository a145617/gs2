"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "@/components/ui/button";

/** 下層ページの見出し（戻るボタン付き） */
export function PageHeader({
  title,
  subtitle,
  back = true,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: boolean | string;
  right?: ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="mb-5 flex items-center gap-3">
      {back && (
        <IconButton
          label="戻る"
          onClick={() => {
            if (typeof back === "string") router.push(back);
            else if (window.history.length > 1) router.back();
            else router.push("/");
          }}
        >
          <ChevronLeft size={20} />
        </IconButton>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="truncate text-xs text-ink-3">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
