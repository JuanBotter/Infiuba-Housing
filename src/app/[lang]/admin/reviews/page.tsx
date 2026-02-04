import { notFound } from "next/navigation";

import { ReviewsPanel } from "@/app/[lang]/admin/reviews/reviews-panel";
import { getListings } from "@/lib/data";
import { isSupportedLanguage } from "@/lib/i18n";
import type { Lang } from "@/types";

export const dynamic = "force-dynamic";

interface ReviewsPageProps {
  params: Promise<{ lang: string }>;
}

export default async function ReviewsPage({ params }: ReviewsPageProps) {
  const resolvedParams = await params;
  if (!isSupportedLanguage(resolvedParams.lang)) {
    notFound();
  }

  const lang = resolvedParams.lang as Lang;
  const listings = await getListings({ includePrivateContactInfo: true });
  const listingMap = Object.fromEntries(
    listings.map((listing) => [listing.id, `${listing.address} · ${listing.neighborhood}`]),
  );

  return <ReviewsPanel lang={lang} listingMap={listingMap} />;
}
