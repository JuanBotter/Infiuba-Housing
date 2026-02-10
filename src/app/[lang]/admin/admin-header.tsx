"use client";

import { usePathname } from "next/navigation";

import { AdminNav } from "@/app/[lang]/admin/admin-nav";
import type { Messages } from "@/i18n/messages";
import type { Lang } from "@/types";

interface AdminHeaderProps {
  lang: Lang;
  messages: Messages;
}

function getAdminSection(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const adminIndex = segments.indexOf("admin");
  return adminIndex >= 0 ? segments[adminIndex + 1] ?? "reviews" : "reviews";
}

export function AdminHeader({ lang, messages }: AdminHeaderProps) {
  const pathname = usePathname();
  const section = getAdminSection(pathname);

  const headerBySection: Record<string, { title: string; subtitle: string }> = {
    reviews: { title: messages.adminTitle, subtitle: messages.adminSubtitle },
    "contact-edits": {
      title: messages.adminNavContactEdits,
      subtitle: messages.adminSubtitleContactEdits,
    },
    access: { title: messages.adminNavAccess, subtitle: messages.adminSubtitleAccess },
    security: { title: messages.adminNavSecurity, subtitle: messages.adminSubtitleSecurity },
    publications: { title: messages.adminNavImages, subtitle: messages.adminSubtitleImages },
    images: { title: messages.adminNavImages, subtitle: messages.adminSubtitleImages },
  };

  const activeHeader = headerBySection[section] ?? headerBySection.reviews;

  return (
    <article className="detail-card detail-card--admin-header">
      <h1>{activeHeader.title}</h1>
      <p>{activeHeader.subtitle}</p>
      <AdminNav lang={lang} />
    </article>
  );
}
