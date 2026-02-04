import { notFound } from "next/navigation";

import { PlaceFilters } from "@/app/[lang]/place-filters";
import { canSubmitReviews, canViewContactInfo, getCurrentUserRole } from "@/lib/auth";
import { getDatasetMeta, getListings, getNeighborhoods } from "@/lib/data";
import { getLocaleForLang } from "@/lib/format";
import { getMessages, isSupportedLanguage } from "@/lib/i18n";
import type { Lang } from "@/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ lang: string }>;
}

export default async function ListingsPage({ params }: PageProps) {
  const resolvedParams = await params;
  if (!isSupportedLanguage(resolvedParams.lang)) {
    notFound();
  }

  const lang = resolvedParams.lang as Lang;
  const messages = getMessages(lang);
  const role = await getCurrentUserRole();
  const canViewPrivateInfo = canViewContactInfo(role);
  const canWriteReviews = canSubmitReviews(role);
  const [listings, neighborhoods, meta] = await Promise.all([
    getListings({ includePrivateContactInfo: canViewPrivateInfo }),
    getNeighborhoods(),
    getDatasetMeta(),
  ]);

  const generatedDate = new Intl.DateTimeFormat(getLocaleForLang(lang), {
    dateStyle: "medium",
  }).format(new Date(meta.generatedAt));

  return (
    <section className="content-wrapper">
      <div className="hero">
        <div className="hero__copy">
          <p className="hero__kicker">{messages.siteSubtitle}</p>
          <h1>{messages.listHeading}</h1>
          <p>{messages.listSubheading}</p>
        </div>
        <div className="hero__metrics">
          <article className="hero-metric">
            <span>{messages.totalPlacesLabel}</span>
            <strong>{meta.totalListings}</strong>
          </article>
          <article className="hero-metric">
            <span>{messages.neighborhoodsLabel}</span>
            <strong>{neighborhoods.length}</strong>
          </article>
          <article className="hero-metric hero-metric--wide">
            <span>{messages.updatedLabel}</span>
            <strong>{generatedDate}</strong>
          </article>
        </div>
      </div>

      <PlaceFilters
        lang={lang}
        messages={messages}
        listings={listings}
        neighborhoods={neighborhoods}
        canWriteReviews={canWriteReviews}
      />

      <p className="data-footnote">
        {meta.totalListings} {messages.footnotePlacesLabel} · {messages.footnoteUpdatedLabel}{" "}
        {generatedDate} · {messages.footnoteContactLabel}:{" "}
        <a href="mailto:jbotter@fi.uba.ar">jbotter@fi.uba.ar</a>
      </p>
    </section>
  );
}
