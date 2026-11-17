import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ひとこま",
  description: "毎朝5時に届くお題で、日常のひとこまを撮る写真SNS",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
