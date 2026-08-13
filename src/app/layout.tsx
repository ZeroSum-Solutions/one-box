import type { Metadata } from "next";
import { Inter_Tight } from "next/font/google";
import "./globals.css";

// GSAP style record calls for "Mori", a commercial face. The record's own
// documented substitute is Inter Tight — bound to --font-mori so
// globals.css and every component reference one token, not two.
const interTight = Inter_Tight({
  variable: "--font-mori",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "one-box",
  description: "Describe the business. Get the site.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${interTight.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
