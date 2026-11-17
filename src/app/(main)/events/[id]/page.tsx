import { Suspense } from "react";
import { PageSpinner } from "@/components/ui/spinner";
import { EventDetailPage } from "./client";

export default function Page() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <EventDetailPage />
    </Suspense>
  );
}
