"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import logoBlack from "../../assets/infiuba black.png";
import logoWhite from "../../assets/infiuba white.png";

type Theme = "light" | "dark";

function getCurrentTheme(): Theme {
  if (typeof document === "undefined") {
    return "light";
  }

  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeLogo() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const root = document.documentElement;
    setTheme(getCurrentTheme());

    const observer = new MutationObserver(() => {
      setTheme(getCurrentTheme());
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <Image
      src={theme === "dark" ? logoWhite : logoBlack}
      alt="Infiuba"
      className="top-bar__logo"
      priority
      sizes="(max-width: 720px) 120px, 150px"
    />
  );
}
