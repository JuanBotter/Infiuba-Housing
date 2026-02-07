import { ContactEditsPanel } from "@/app/[lang]/admin/contact-edits/contact-edits-panel";
import { getMessages } from "@/lib/i18n";
import type { Lang } from "@/types";

interface ContactEditsPageProps {
  params: Promise<{ lang: Lang }>;
}

export default async function ContactEditsPage({ params }: ContactEditsPageProps) {
  const resolvedParams = await params;
  const messages = getMessages(resolvedParams.lang);

  return <ContactEditsPanel lang={resolvedParams.lang} messages={messages} />;
}
