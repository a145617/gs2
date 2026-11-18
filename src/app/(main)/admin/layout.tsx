import { AdminFrame } from "@/components/admin/admin-frame";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminFrame>{children}</AdminFrame>;
}
