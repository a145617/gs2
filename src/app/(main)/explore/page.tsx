"use client";

import { PageHeader } from "@/components/shell/page-header";
import { ThemeArchive } from "@/components/theme/theme-archive";

export default function ExplorePage() {
  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <PageHeader title="さがす" back={false} />
      <ThemeArchive />
    </div>
  );
}
