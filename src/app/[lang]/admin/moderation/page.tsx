import { notFound } from "next/navigation";

import { ModerationPanel } from "@/app/[lang]/admin/moderation/panel";
import { getListings } from "@/lib/data";
import { getMessages, isSupportedLanguage } from "@/lib/i18n";
import type { Lang } from "@/types";

interface ModerationPageProps {
  params: Promise<{ lang: string }>;
}

export default async function ModerationPage({ params }: ModerationPageProps) {
  const resolvedParams = await params;
  if (!isSupportedLanguage(resolvedParams.lang)) {
    notFound();
  }

  const lang = resolvedParams.lang as Lang;
  const messages = getMessages(lang);
  const listingMap = Object.fromEntries(
    getListings().map((listing) => [listing.id, `${listing.address} · ${listing.neighborhood}`]),
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
