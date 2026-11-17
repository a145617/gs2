import { Suspense } from "react";
import { PageSpinner } from "@/components/ui/spinner";
import { TagPage } from "./client";

export default function Page() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <TagPage />
    </Suspense>
  );
}
