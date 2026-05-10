import type { Metadata } from "next";
import localFont from "next/font/local";
import { Kreon } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
// zopf 公式サイトと同じ slab serif (ロゴ・見出し用)
const kreon = Kreon({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-kreon",
});

export const metadata: Metadata = {
  title: "zopf シフト管理",
  description: "パン焼き小屋ツオップ シフト管理システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${kreon.variable} antialiased`}
      >
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
