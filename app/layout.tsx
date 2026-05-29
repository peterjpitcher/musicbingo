import "./globals.css";
import type { Metadata } from "next";
import { Inter, Anton, Archivo } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", display: "swap" });
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });

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
    <html lang="en" className={`${inter.variable} ${anton.variable} ${archivo.variable}`}>
      <body className="min-h-screen bg-ink text-cream font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
