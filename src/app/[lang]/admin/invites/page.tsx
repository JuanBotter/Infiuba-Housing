import { notFound } from "next/navigation";

import { InvitesPanel } from "@/app/[lang]/admin/invites/invites-panel";
import { isSupportedLanguage } from "@/lib/i18n";
import type { Lang } from "@/types";

export const dynamic = "force-dynamic";

interface InvitesPageProps {
  params: Promise<{ lang: string }>;
}

export default async function InvitesPage({ params }: InvitesPageProps) {
  const resolvedParams = await params;
  if (!isSupportedLanguage(resolvedParams.lang)) {
    notFound();
  }

  return <InvitesPanel lang={resolvedParams.lang as Lang} />;
}
