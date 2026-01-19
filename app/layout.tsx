import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Music Bingo",
  description: "Generate a ZIP bundle: music bingo cards (PDF) + Spotify helper.",
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
