"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { EventView } from "@/components/event/event-view";

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="イベント" />
      <EventView eventId={id} showCamera={false} />
    </div>
  );
}
