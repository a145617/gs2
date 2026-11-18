import type { Metadata, Viewport } from "next";
import { Shippori_Mincho, Zen_Kaku_Gothic_New } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { BootScript } from "@/components/shell/boot-script";

const zen = Zen_Kaku_Gothic_New({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-zen",
  display: "swap",
  preload: false,
});

const mincho = Shippori_Mincho({
  weight: ["500", "700"],
  subsets: ["latin"],
  variable: "--font-mincho",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "ひとこま", template: "%s | ひとこま" },
  description: "毎朝5時に届く抽象的なお題に沿って、日常のひとこまを撮って共有する写真SNS",
  applicationName: "ひとこま",
  appleWebApp: { capable: true, title: "ひとこま", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e6e9ef" },
    { media: "(prefers-color-scheme: dark)", color: "#23272f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${zen.variable} ${mincho.variable}`} suppressHydrationWarning>
      <head>
        <BootScript />
      </head>
      <body>
        <div className="ambient" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
