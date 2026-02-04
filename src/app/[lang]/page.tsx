import { notFound } from "next/navigation";

import { PlaceFilters } from "@/app/[lang]/place-filters";
import { getDatasetMeta, getListings, getNeighborhoods } from "@/lib/data";
import { getMessages, isSupportedLanguage } from "@/lib/i18n";
import type { Lang } from "@/types";

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
  const listings = getListings();
  const neighborhoods = getNeighborhoods();
  const meta = getDatasetMeta();

  const generatedDate = new Intl.DateTimeFormat(lang === "es" ? "es-AR" : "en-US", {
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
      />

      <p className="data-footnote">
        {lang === "es"
          ? `${meta.totalListings} alojamientos · Fuente: ${meta.sourceFile} · Actualizado ${generatedDate}`
          : `${meta.totalListings} places · Source: ${meta.sourceFile} · Updated ${generatedDate}`}
      </p>
    </section>
  );
}
