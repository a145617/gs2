import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty";

export default function HomePage() {
  return (
    <>
      <PageHeader title="ホーム" back={false} />
      <EmptyState title="準備中です">フィードは次の機能ブランチで実装します。</EmptyState>
    </>
  );
}
