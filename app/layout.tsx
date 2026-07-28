import type { Metadata } from "next";
import { Noto_Sans, Noto_Sans_Georgian, Geist_Mono } from "next/font/google";
import "./globals.css";

const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin", "latin-ext", "cyrillic"],
});

const notoSansGeorgian = Noto_Sans_Georgian({
  variable: "--font-noto-sans-georgian",
  subsets: ["georgian", "latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "პროექტების მართვა — Project Management",
  description: "Dashboard of all project timelines, deliverables and tasks",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ka"
      data-theme="light"
      suppressHydrationWarning
      className={`${notoSans.variable} ${notoSansGeorgian.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Runs while the HTML is still parsing, before anything is painted, so
            a dark-theme user never sees a flash of the light palette. Kept in
            sync with lib/theme.ts — same storage key, same resolution rule. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <div className="sts-topbar" aria-hidden>
          <i style={{ background: "#db4536", flexGrow: 20 }} />
          <i style={{ background: "#ef7d1a", flexGrow: 10 }} />
          <i style={{ background: "#f2a50a", flexGrow: 34 }} />
          <i style={{ background: "#5cb036", flexGrow: 8 }} />
          <i style={{ background: "#099c57", flexGrow: 28 }} />
        </div>
        {children}
      </body>
    </html>
  );
}
