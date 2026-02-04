"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { languageLabels, supportedLanguages } from "@/lib/i18n";
import type { Lang } from "@/types";

function replaceLanguageInPath(pathname: string, nextLang: Lang) {
  if (!pathname || pathname === "/") {
    return `/${nextLang}`;
  }

  const segments = pathname.split("/");
  if (segments.length > 1 && supportedLanguages.includes(segments[1] as Lang)) {
    segments[1] = nextLang;
    return segments.join("/");
  }

  return `/${nextLang}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function LanguageIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="8.9" />
      <path d="M3.4 12h17.2M12 3.1a12.2 12.2 0 0 1 0 17.8M12 3.1a12.2 12.2 0 0 0 0 17.8" />
    </svg>
  );
}

export function LanguageSwitcher({ lang, label }: { lang: Lang; label: string }) {
  const pathname = usePathname();

  return (
    <details className="language-menu">
      <summary
        className="top-bar__language"
        aria-label={`${label}: ${languageLabels[lang]}`}
        title={`${label}: ${languageLabels[lang]}`}
      >
        <LanguageIcon />
      </summary>
      <div className="language-menu__popover">
        {supportedLanguages.map((candidate) => {
          const href = replaceLanguageInPath(pathname || "/", candidate);
          return (
            <Link
              key={candidate}
              href={href}
              className={`language-menu__item ${candidate === lang ? "is-active" : ""}`}
            >
              <span>{languageLabels[candidate]}</span>
              <strong>{candidate.toUpperCase()}</strong>
            </Link>
          );
        })}
      </div>
    </details>
  );
}
