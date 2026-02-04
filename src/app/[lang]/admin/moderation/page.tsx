import { notFound, redirect } from "next/navigation";

import { ModerationPanel } from "@/app/[lang]/admin/moderation/panel";
import { canAccessAdmin, getCurrentUserRole } from "@/lib/auth";
import { getListings } from "@/lib/data";
import { getMessages, isSupportedLanguage } from "@/lib/i18n";
import type { Lang } from "@/types";

export const dynamic = "force-dynamic";

interface ModerationPageProps {
  params: Promise<{ lang: string }>;
}

export default async function ModerationPage({ params }: ModerationPageProps) {
  const resolvedParams = await params;
  if (!isSupportedLanguage(resolvedParams.lang)) {
    notFound();
  }

  const lang = resolvedParams.lang as Lang;
  const role = await getCurrentUserRole();
  if (!canAccessAdmin(role)) {
    redirect(`/${lang}`);
  }

  const messages = getMessages(lang);
  const listings = await getListings({ includePrivateContactInfo: true });
  const listingMap = Object.fromEntries(
    listings.map((listing) => [listing.id, `${listing.address} · ${listing.neighborhood}`]),
  );

  return (
    <section className="content-wrapper">
      <article className="detail-card">
        <h1>{messages.adminTitle}</h1>
        <p>{messages.adminSubtitle}</p>
      </article>
      <ModerationPanel lang={lang} listingMap={listingMap} />
    </section>
  );
}
