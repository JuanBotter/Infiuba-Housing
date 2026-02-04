import Link from "next/link";
import { notFound } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { getMessages, isSupportedLanguage, supportedLanguages } from "@/lib/i18n";
import type { Lang } from "@/types";

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

export function generateStaticParams() {
  return supportedLanguages.map((lang) => ({ lang }));
}

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}

export default async function LanguageLayout({ children, params }: LayoutProps) {
  const resolvedParams = await params;
  if (!isSupportedLanguage(resolvedParams.lang)) {
    notFound();
  }

  const lang = resolvedParams.lang as Lang;
  const t = getMessages(lang);
  const altLang = lang === "en" ? "es" : "en";

  return (
    <div className="page-shell">
      <header className="top-bar">
        <Link className="top-bar__brand" href={`/${lang}`}>
          {t.siteTitle}
        </Link>
        <div className="top-bar__actions">
          <Link className="top-bar__admin" href={`/${lang}/admin/moderation`}>
            {t.adminLabel}
          </Link>
          <Link
            className="top-bar__language"
            href={`/${altLang}`}
            aria-label={`${t.languageSwitch}: ${altLang.toUpperCase()}`}
            title={`${t.languageSwitch}: ${altLang.toUpperCase()}`}
          >
            <LanguageIcon />
          </Link>
          <ThemeToggle lang={lang} />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
