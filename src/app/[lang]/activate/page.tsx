import { notFound } from "next/navigation";

import { ActivateInviteErrorView } from "@/app/[lang]/activate/activate-error-view";
import { ActivateInviteForm } from "@/app/[lang]/activate/activate-form";
import { isInviteTokenActive } from "@/lib/auth";
import { getMessages, isSupportedLanguage } from "@/lib/i18n";
import type { Lang } from "@/types";

export const dynamic = "force-dynamic";

interface ActivatePageProps {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function ActivatePage({ params, searchParams }: ActivatePageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  if (!isSupportedLanguage(resolvedParams.lang)) {
    notFound();
  }

  const lang = resolvedParams.lang as Lang;
  const messages = getMessages(lang);
  const token =
    typeof resolvedSearchParams.token === "string"
      ? resolvedSearchParams.token.slice(0, 240)
      : "";

  let initialError = "";
  let tokenLocked = false;
  let inviteEmail = "";
  if (!token) {
    initialError = messages.activateInviteMissingTokenError;
    tokenLocked = true;
  } else {
    const inviteStatus = await isInviteTokenActive(token);
    if (inviteStatus.ok && inviteStatus.active) {
      inviteEmail = inviteStatus.email || "";
    } else if (inviteStatus.ok && !inviteStatus.active) {
      initialError = messages.activateInviteExpiredError;
      tokenLocked = true;
    }
  }

  if (tokenLocked) {
    return (
      <ActivateInviteErrorView
        title={messages.activateInviteExpiredTitle}
        error={initialError}
        contactHint={messages.activateInviteContactAdminHint}
      />
    );
  }

  return (
    <section className="content-wrapper">
      <article className="detail-card detail-card--form">
        <h1>{messages.activateInviteTitle}</h1>
        <p>{messages.activateInviteSubtitle}</p>
        <ActivateInviteForm lang={lang} token={token} inviteEmail={inviteEmail} />
      </article>
    </section>
  );
}
