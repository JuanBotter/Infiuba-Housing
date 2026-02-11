import { notFound } from "next/navigation";

import { ReviewsPanel } from "@/app/[lang]/admin/reviews/reviews-panel";
import { getListingAddressMap } from "@/lib/data";
import { getMessages, isSupportedLanguage } from "@/lib/i18n";
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
  const messages = getMessages(lang);
  const listingMap = await getListingAddressMap();

  return <ReviewsPanel lang={lang} listingMap={listingMap} messages={messages} />;
}
