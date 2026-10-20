import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { DotGothic16, JetBrains_Mono } from "next/font/google";
import "../styles/tailwind.css";
import "../styles/globals.css";
import "../styles/widgets.css";

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
  title: "AVN Hub",
  description: "A living personal dashboard for what I'm listening to, playing, building, and running.",
};

// explicit so mobile browsers lay out at device width instead of a zoomed-out
// desktop viewport (the Slot Layout's mobile collapse in globals.css depends
// on real device-width media queries matching)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // ember page background; the in-app theme can differ from the OS scheme,
  // so this is a best-effort browser-chrome match
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#13100c" },
    { media: "(prefers-color-scheme: light)", color: "#d8cfbc" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dotGothic16.variable} ${jetBrainsMono.variable} h-full antialiased`}
      // the pre-paint theme script below mutates data-theme before hydration —
      // expected divergence from server HTML, not a bug
      suppressHydrationWarning
    >
      <head>
        {/* pre-paint theme script — must stay a raw string (no TS imports
            possible here). Theme/palette/backdrop/canvas-border are per-canvas
            (lib/theme.ts, lib/wallpaper.ts, lib/canvases.ts); "default" below
            must match DEFAULT_CANVAS_ID. The "wallpaper" (auto) palette's
            generated tokens are injected from lib/wallpaperPalette.ts's
            per-canvas cache. The wallpaper image itself isn't
            read here — IndexedDB is async-only, so it necessarily pops in
            after mount (see WallpaperLayer). */}
        <Script
          id="nutmag-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var a="default";try{var c=JSON.parse(localStorage.getItem("nutmag-canvases"));if(c&&typeof c.activeId==="string")a=c.activeId;}catch(e){}var s=a==="default"?"":"::"+a;var t=localStorage.getItem("nutmag-theme"+s);var h=new Date().getHours();if(t==="light"||(t==="auto"&&h>=6&&h<20)){document.documentElement.dataset.theme="light";}var p=localStorage.getItem("nutmag-palette"+s);if(p&&p!=="ember"){document.documentElement.dataset.palette=p;}if(p==="wallpaper"){try{var q=JSON.parse(localStorage.getItem("nutmag-wallpaper-palette"+s));if(q&&typeof q.css==="string"){var st=document.createElement("style");st.id="nutmag-wallpaper-palette";st.textContent=q.css;document.head.appendChild(st);}}catch(e){}}var b=localStorage.getItem("nutmag-backdrop"+s);if(b==="blur"||b==="transparent"||b==="glass"){document.documentElement.dataset.backdrop=b;}var w=localStorage.getItem("nutmag-widget-backdrop"+s);if(w==="blur"||w==="transparent"||w==="glass"){document.documentElement.dataset.widgetBackdrop=w;}if(localStorage.getItem("nutmag-canvas-border"+s)==="0"){document.documentElement.dataset.canvasBorder="hidden";}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
