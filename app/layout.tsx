import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Music Bingo",
  description: "Generate music bingo cards (PDF) and a private Spotify playlist.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
