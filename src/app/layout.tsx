import type { Metadata } from "next";
import { Syne, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { AudioPlayerProvider } from "@/contexts/audio-player-context";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Extended Play — Rhythm Lab Radio",
  description:
    "Explore 20 years of music connections through conversation, powered by Gemini and Google Cloud.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${hankenGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <ConvexClientProvider>
          <AudioPlayerProvider>{children}</AudioPlayerProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
