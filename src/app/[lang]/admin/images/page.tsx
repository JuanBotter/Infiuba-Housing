import { redirect } from "next/navigation";

interface LegacyImagesPageProps {
  params: Promise<{ lang: string }>;
}

export default async function LegacyImagesPage({ params }: LegacyImagesPageProps) {
  const resolvedParams = await params;
  redirect(`/${resolvedParams.lang}/admin/publications`);
}
