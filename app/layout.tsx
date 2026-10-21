import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FamilyTrip",
  description: "Settle on one day plan the whole family accepts.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf6ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1220" },
  ],
};

function Scene() {
  return (
    <div className="scene" aria-hidden>
      {/* A dashed flight path drifting in from the top right. */}
      <svg className="scene-path" viewBox="0 0 540 300" fill="none">
        <path d="M540 40 C 420 30, 360 140, 250 150 S 80 120, 20 260" stroke="currentColor" strokeWidth="2" strokeDasharray="2 9" strokeLinecap="round" />
        <g transform="translate(246 146) rotate(-160)" fill="currentColor">
          <path d="M0 0 L16 -5 L13 0 L16 5 Z" />
        </g>
      </svg>
    </div>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full text-stone-900 dark:text-stone-100">
        <Scene />
        <div className="mx-auto flex min-h-full max-w-xl flex-col px-4 pb-16">
          <header className="flex items-center py-5">
            <Link href="/" className="group inline-flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-teal-600 to-amber-500 text-white shadow-md shadow-teal-900/20 transition-transform group-hover:-rotate-6">
                <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
                  <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
                </svg>
              </span>
              <span className="text-lg font-semibold tracking-tight text-stone-900 dark:text-white">
                Family<span className="text-teal-700 dark:text-teal-300">Trip</span>
              </span>
            </Link>
          </header>
          <main className="flex-1 space-y-4">{children}</main>
        </div>
      </body>
    </html>
  );
}
