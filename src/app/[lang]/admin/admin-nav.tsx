"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

import type { Messages } from "@/i18n/messages";
import type { Lang } from "@/types";

interface AdminNavProps {
  lang: Lang;
  messages: Pick<
    Messages,
    | "adminLabel"
    | "adminNavReviews"
    | "adminNavContactEdits"
    | "adminNavAccess"
    | "adminNavSecurity"
    | "adminNavImages"
  >;
}

export function AdminNav({ lang, messages }: AdminNavProps) {
  const segment = useSelectedLayoutSegment();

  return (
    <nav className="view-toggle admin-nav" aria-label={messages.adminLabel}>
      <Link
        href={`/${lang}/admin/reviews`}
        className={`view-toggle__button admin-nav__link ${segment === "reviews" ? "is-active" : ""}`}
      >
        {messages.adminNavReviews}
      </Link>
      <Link
        href={`/${lang}/admin/contact-edits`}
        className={`view-toggle__button admin-nav__link ${segment === "contact-edits" ? "is-active" : ""}`}
      >
        {messages.adminNavContactEdits}
      </Link>
      <Link
        href={`/${lang}/admin/access`}
        className={`view-toggle__button admin-nav__link ${segment === "access" ? "is-active" : ""}`}
      >
        {messages.adminNavAccess}
      </Link>
      <Link
        href={`/${lang}/admin/security`}
        className={`view-toggle__button admin-nav__link ${segment === "security" ? "is-active" : ""}`}
      >
        {messages.adminNavSecurity}
      </Link>
      <Link
        href={`/${lang}/admin/publications`}
        className={`view-toggle__button admin-nav__link ${segment === "publications" ? "is-active" : ""}`}
      >
        {messages.adminNavImages}
      </Link>
    </nav>
  );
}
