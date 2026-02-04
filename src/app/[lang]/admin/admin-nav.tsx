"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

import { getMessages } from "@/lib/i18n";
import type { Lang } from "@/types";

interface AdminNavProps {
  lang: Lang;
}

export function AdminNav({ lang }: AdminNavProps) {
  const messages = getMessages(lang);
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
        href={`/${lang}/admin/invites`}
        className={`view-toggle__button admin-nav__link ${segment === "invites" ? "is-active" : ""}`}
      >
        {messages.adminNavInvites}
      </Link>
      <Link
        href={`/${lang}/admin/access`}
        className={`view-toggle__button admin-nav__link ${segment === "access" ? "is-active" : ""}`}
      >
        {messages.adminNavAccess}
      </Link>
    </nav>
  );
}
