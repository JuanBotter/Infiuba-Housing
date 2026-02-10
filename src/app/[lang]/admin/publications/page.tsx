import { notFound } from "next/navigation";

import { PublicationsPanel } from "@/app/[lang]/admin/publications/publications-panel";
import { getAdminListingImageSummaries } from "@/lib/admin-listing-images";
import { getMessages, isSupportedLanguage } from "@/lib/i18n";
import type { Lang } from "@/types";

export const dynamic = "force-dynamic";

interface PublicationsPageProps {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ listingId?: string | string[] }>;
}

export default async function PublicationsPage({ params, searchParams }: PublicationsPageProps) {
  const resolvedParams = await params;
  if (!isSupportedLanguage(resolvedParams.lang)) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const rawListingId = Array.isArray(resolvedSearchParams.listingId)
    ? resolvedSearchParams.listingId[0]
    : resolvedSearchParams.listingId;
  const initialListingId = typeof rawListingId === "string" ? rawListingId.trim() : "";

  const lang = resolvedParams.lang as Lang;
  const messages = getMessages(lang);
  const listings = await getAdminListingImageSummaries();

  return (
    <PublicationsPanel
      lang={lang}
      messages={messages}
      initialListings={listings}
      initialListingId={initialListingId || undefined}
    />
  );
}
