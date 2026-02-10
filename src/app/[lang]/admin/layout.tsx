import { notFound, redirect } from "next/navigation";

import { AdminHeader } from "@/app/[lang]/admin/admin-header";
import { canAccessAdmin, getCurrentUserRole } from "@/lib/auth";
import { getMessages, isSupportedLanguage } from "@/lib/i18n";
import type { Lang } from "@/types";

export const dynamic = "force-dynamic";

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

  return (
    <section className="content-wrapper content-wrapper--admin">
      <AdminHeader lang={lang} messages={messages} />
      <section className="admin-shell">{children}</section>
    </section>
  );
}
