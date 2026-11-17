import { Suspense } from "react";
import { PageSpinner } from "@/components/ui/spinner";
import { ExplorePage } from "./client";

export default function Page() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <ExplorePage />
    </Suspense>
  );
}
