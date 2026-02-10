import { notFound } from "next/navigation";

import { ImagesPanel } from "@/app/[lang]/admin/images/images-panel";
import { getAdminListingImageSummaries } from "@/lib/admin-listing-images";
import { getMessages, isSupportedLanguage } from "@/lib/i18n";
import type { Lang } from "@/types";

export const dynamic = "force-dynamic";

interface ImagesPageProps {
  params: Promise<{ lang: string }>;
}

export default async function ImagesPage({ params }: ImagesPageProps) {
  const resolvedParams = await params;
  if (!isSupportedLanguage(resolvedParams.lang)) {
    notFound();
  }

  const lang = resolvedParams.lang as Lang;
  const messages = getMessages(lang);
  const listings = await getAdminListingImageSummaries();

  return <ImagesPanel messages={messages} initialListings={listings} />;
}
