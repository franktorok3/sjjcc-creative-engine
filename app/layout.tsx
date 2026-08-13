import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SJJCC Creative Engine",
  description:
    "Create a branded marketing asset and send it to the Marketing Project Requests workflow.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
