import Link from "next/link";
import { notFound } from "next/navigation";

import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeLogo } from "@/components/theme-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { getMessages, isSupportedLanguage, supportedLanguages } from "@/lib/i18n";
import type { Lang } from "@/types";

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

  return (
    <div className="page-shell">
      <header className="top-bar">
        <Link className="top-bar__brand" href={`/${lang}`} aria-label={t.siteTitle}>
          <ThemeLogo />
        </Link>
        <div className="top-bar__actions">
          <Link className="top-bar__admin" href={`/${lang}/admin/moderation`}>
            {t.adminLabel}
          </Link>
          <LanguageSwitcher lang={lang} label={t.languageSwitch} />
          <ThemeToggle lang={lang} />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
