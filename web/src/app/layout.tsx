import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "C++ Recall — Daily interview practice",
  description: "Ôn phỏng vấn C++ mỗi ngày từ chính repository ghi chú của bạn.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
