import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { DotGothic16, JetBrains_Mono } from "next/font/google";
import "../../styles/globals.css";
import "../../styles/widgets.css";

const dotGothic16 = DotGothic16({
  variable: "--font-dot-gothic",
  weight: "400",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AVN Hub Wallpaper",
  description: "AVN Hub, live on your desktop via Wallpaper Engine.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function WallpaperRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dotGothic16.variable} ${jetBrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* same pre-paint theme script as the main app's app/layout.tsx, so
            switching canvases (lib/canvases.ts) on the wallpaper doesn't
            flash the wrong theme on the next load */}
        <Script
          id="nutmag-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var a="default";try{var c=JSON.parse(localStorage.getItem("nutmag-canvases"));if(c&&typeof c.activeId==="string")a=c.activeId;}catch(e){}var s=a==="default"?"":"::"+a;var t=localStorage.getItem("nutmag-theme"+s);var h=new Date().getHours();if(t==="light"||(t==="auto"&&h>=6&&h<20)){document.documentElement.dataset.theme="light";}var p=localStorage.getItem("nutmag-palette"+s);if(p&&p!=="ember"){document.documentElement.dataset.palette=p;}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col" style={{ background: "var(--bg-page)" }}>
        {children}
      </body>
    </html>
  );
}
