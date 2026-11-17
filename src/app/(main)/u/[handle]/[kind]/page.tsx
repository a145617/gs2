import { Suspense } from "react";
import { PageSpinner } from "@/components/ui/spinner";
import { FollowListPage } from "./client";

export default function Page() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <FollowListPage />
    </Suspense>
  );
}
