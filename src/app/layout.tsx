import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { PageVisibility } from "@/components/PageVisibility";
import "./globals.css";

// Midnight Instrument contract (DESIGN.md): Switzer carries all UI text,
// Clash Display carries display/headings, JetBrains Mono carries run ids and
// technical metadata. Switzer's Medium/Semibold files serve the contract's
// 510/590 weight roles. Fontshare FFL (Switzer, Clash) + OFL (JetBrains Mono).
const switzer = localFont({
  variable: "--font-body",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
  src: [
    { path: "../fonts/Switzer-Regular.woff2", weight: "400" },
    { path: "../fonts/Switzer-Medium.woff2", weight: "510" },
    { path: "../fonts/Switzer-Semibold.woff2", weight: "590" },
  ],
});

const clashDisplay = localFont({
  variable: "--font-display",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
  src: [
    { path: "../fonts/ClashDisplay-Medium.woff2", weight: "500" },
    { path: "../fonts/ClashDisplay-Semibold.woff2", weight: "600" },
  ],
});

const jetbrainsMono = localFont({
  variable: "--font-mono-app",
  display: "swap",
  fallback: ["ui-monospace", "Menlo", "monospace"],
  src: [{ path: "../fonts/JetBrainsMono-Regular.woff2", weight: "400" }],
});

export const metadata: Metadata = {
  title: { default: "ONE BOX", template: "%s · ONE BOX" },
  description: "Describe the business. Get the site.",
};

// The shell is dark-only (DESIGN.md §Surfaces). Declaring it makes the browser
// render scrollbars, native form controls and the URL bar in the same key,
// instead of dropping light chrome onto a void canvas.
export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#08090a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${switzer.variable} ${clashDisplay.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full antialiased">
        <PageVisibility />
        {children}
      </body>
    </html>
  );
}
