import "./globals.css";
import type { Metadata } from "next";
import { Clicker_Script, DM_Serif_Display, Outfit } from "next/font/google";

// The Anchor's fonts. The variable names are fixed by @anchor-nights/kit
// (FONT_VARIABLES), which its tokens.css reads.
const display = DM_Serif_Display({ variable: "--font-dm-serif", weight: "400", subsets: ["latin"], display: "swap" });
const body = Outfit({ variable: "--font-outfit", weight: ["400", "500", "600", "700"], subsets: ["latin"], display: "swap" });
const script = Clicker_Script({ variable: "--font-clicker", weight: "400", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Music Bingo at The Anchor",
  description: "Prepare and run Music Bingo nights at The Anchor.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html lang="en-GB" className={`${display.variable} ${body.variable} ${script.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
