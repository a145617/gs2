"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { ProfileView } from "@/components/profile/profile-view";

export function UserPage() {
  const { handle } = useParams<{ handle: string }>();
  return (
    <>
      <PageHeader title="プロフィール" />
      <ProfileView handle={handle} />
    </>
  );
}
