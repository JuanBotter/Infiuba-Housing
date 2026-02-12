import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, Work_Sans } from "next/font/google";
import { headers } from "next/headers";
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const fontVariablesClassName = `${plusJakartaSans.variable} ${workSans.variable} ${inter.variable}`;
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") || undefined;

  return (
    <html lang="en" suppressHydrationWarning className={fontVariablesClassName}>
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" nonce={nonce} />
      </head>
      <body>{children}</body>
    </html>
  );
}
