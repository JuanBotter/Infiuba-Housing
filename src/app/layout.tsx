import type { Metadata } from "next";
import Script from "next/script";

import "@/app/globals.css";
import "leaflet/dist/leaflet.css";

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
      <body>{children}</body>
    </html>
  );
}
