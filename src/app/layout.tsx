import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, Work_Sans } from "next/font/google";
import Script from "next/script";

import "@/app/globals.css";
import "leaflet/dist/leaflet.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-plus-jakarta-sans",
});

const workSans = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-work-sans",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Infiuba Housing Hub",
  description: "Housing reviews from exchange students in Buenos Aires.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body className={`${plusJakartaSans.variable} ${workSans.variable} ${inter.variable}`}>
        {children}
      </body>
    </html>
  );
}
