import { AppShell } from "@/components/shell/app-shell";

export default function MainLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
