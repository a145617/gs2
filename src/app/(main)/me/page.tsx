"use client";

import { ProfileView } from "@/components/profile/profile-view";
import { PageSpinner } from "@/components/ui/spinner";
import { useMe } from "@/lib/client/session";

/** マイページ（自分のプロフィール） */
export default function MyPage() {
  const { me } = useMe();
  if (!me) return <PageSpinner />;
  return <ProfileView handle={me.handle} />;
}
