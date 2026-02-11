import Link from "next/link";
import { notFound } from "next/navigation";

import { LanguageSwitcher } from "@/components/language-switcher";
import { RoleSwitcher } from "@/components/role-switcher";
import { ThemeLogo } from "@/components/theme-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { canAccessAdmin, getCurrentAuthSession } from "@/lib/auth";
import { getMessages, isSupportedLanguage, pickMessages, supportedLanguages } from "@/lib/i18n";
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
  const authSession = await getCurrentAuthSession();
  const role = authSession.role;

  return (
    <div className="page-shell">
      <header className="top-bar">
        <Link className="top-bar__brand" href={`/${lang}`} aria-label={t.siteTitle}>
          <ThemeLogo />
        </Link>
        <div className="top-bar__actions">
          <RoleSwitcher
            lang={lang}
            role={role}
            email={authSession.email}
            messages={t}
          />
          {canAccessAdmin(role) ? (
            <Link className="top-bar__admin" href={`/${lang}/admin/reviews`}>
              {t.adminLabel}
            </Link>
          ) : null}
          <LanguageSwitcher lang={lang} label={t.languageSwitch} />
          <ThemeToggle
            messages={pickMessages(t, ["themeToggleLabel", "themeDark", "themeLight"] as const)}
          />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
