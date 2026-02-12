import { notFound, redirect } from "next/navigation";

import { AdminHeader } from "@/app/[lang]/admin/admin-header";
import {
  canAccessAdmin,
  getCurrentUserRole,
  isVisitorOwnerContactOverrideActive,
} from "@/lib/auth";
import { getMessages, isSupportedLanguage } from "@/lib/i18n";
import { recordSecurityAuditEvent } from "@/lib/security-audit";
import type { Lang } from "@/types";

export const dynamic = "force-dynamic";
let hasRecordedOverrideAuditEvent = false;

const OVERRIDE_BANNER_TEXT: Record<Lang, string> = {
  en: "Emergency override active: visitors can currently view owner contacts.",
  es: "Override de emergencia activo: los visitantes pueden ver contactos de propietarios.",
  fr: "Mode d'urgence actif : les visiteurs peuvent voir les contacts des propriétaires.",
  de: "Notfall-Override aktiv: Besucher koennen Eigentuemerkontakte sehen.",
  pt: "Override de emergencia ativo: visitantes podem ver contatos de proprietarios.",
  it: "Override di emergenza attivo: i visitatori possono vedere i contatti dei proprietari.",
  no: "Nodoverstyring aktiv: besokende kan se vertskontakter.",
};

interface AdminLayoutProps {
  children: React.ReactNode;
  params: Promise<unknown>;
}

export default async function AdminLayout({ children, params }: AdminLayoutProps) {
  const resolvedParams = (await params) as { lang?: string };
  if (!resolvedParams?.lang || !isSupportedLanguage(resolvedParams.lang)) {
    notFound();
  }

  const lang = resolvedParams.lang as Lang;
  const role = await getCurrentUserRole();
  if (!canAccessAdmin(role)) {
    redirect(`/${lang}`);
  }

  const messages = getMessages(lang);
  const ownerContactOverrideActive = isVisitorOwnerContactOverrideActive();
  if (ownerContactOverrideActive && !hasRecordedOverrideAuditEvent) {
    await recordSecurityAuditEvent({
      eventType: "security.config.override",
      outcome: "active",
      actorEmail: null,
      targetEmail: null,
      metadata: {
        flag: "VISITOR_CAN_VIEW_OWNER_CONTACTS",
        surfacedIn: "admin_layout",
      },
    });
    hasRecordedOverrideAuditEvent = true;
  }

  return (
    <section className="content-wrapper content-wrapper--admin">
      <AdminHeader lang={lang} messages={messages} />
      <section className="admin-shell">
        {ownerContactOverrideActive ? (
          <p className="admin-override-banner">{OVERRIDE_BANNER_TEXT[lang]}</p>
        ) : null}
        {children}
      </section>
    </section>
  );
}
