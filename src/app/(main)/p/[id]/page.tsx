import { Suspense } from "react";
import { PageSpinner } from "@/components/ui/spinner";
import { PostPage } from "./client";

// URL（パラメータ）を読むクライアント部品は Suspense で囲む
export default function Page() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <PostPage />
    </Suspense>
  );
}
