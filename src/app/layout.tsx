import type { Metadata } from "next";
import Link from "next/link";
import { Sora, Nunito } from "next/font/google";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Seachan Quiz",
  description: "Mini realtime quiz battle with QR join flow"
};

const displayFont = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800"]
});

const bodyFont = Nunito({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700", "800"]
});

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable}`}>
        <header className="sticky top-0 z-40 border-b border-white/50 bg-white/75 backdrop-blur-lg">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
            <Link
              href="/"
              className="font-display rounded-full bg-white px-4 py-2 text-lg font-extrabold tracking-tight text-slate-900 shadow-[0_8px_25px_-15px_rgba(12,74,110,0.55)]"
            >
              Seachan Quiz
            </Link>
            <nav className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <Link href="/host" className="rounded-full px-4 py-2 transition hover:bg-slate-100 hover:text-slate-900">
                Host
              </Link>
              <Link
                href="/leaderboard"
                className="rounded-full bg-slate-900 px-4 py-2 text-white transition hover:bg-slate-800"
              >
                Leaderboard
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
