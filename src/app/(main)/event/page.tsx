import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty";

export default function Page() {
  return (
    <>
      <PageHeader title="イベント" back={false} />
      <EmptyState title="準備中です">この画面は次の機能ブランチで実装します。</EmptyState>
    </>
  );
}
