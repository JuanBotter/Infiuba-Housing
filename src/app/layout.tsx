import type { Metadata } from "next";

import "@/app/globals.css";
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: "Infiuba Housing Hub",
  description: "Housing reviews from exchange students in Buenos Aires.",
};

const themeScript = `
(() => {
  try {
    const stored = window.localStorage.getItem("infiuba-theme");
    const theme =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.dataset.theme = theme;
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
