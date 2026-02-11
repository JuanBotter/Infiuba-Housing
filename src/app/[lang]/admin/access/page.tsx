import { notFound } from "next/navigation";

import { AccessPanel } from "@/app/[lang]/admin/access/access-panel";
import { getMessages, isSupportedLanguage } from "@/lib/i18n";
import type { Lang } from "@/types";

export const dynamic = "force-dynamic";

interface AccessPageProps {
  params: Promise<{ lang: string }>;
}

export default async function AccessPage({ params }: AccessPageProps) {
  const resolvedParams = await params;
  if (!isSupportedLanguage(resolvedParams.lang)) {
    notFound();
  }

  const lang = resolvedParams.lang as Lang;
  const messages = getMessages(lang);
  return <AccessPanel lang={lang} messages={messages} />;
}
