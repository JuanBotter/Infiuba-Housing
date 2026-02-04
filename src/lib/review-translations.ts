import type { Lang } from "@/types";

export interface ReviewTranslationColumns {
  comment_en?: string | null;
  comment_es?: string | null;
  comment_fr?: string | null;
  comment_de?: string | null;
  comment_pt?: string | null;
  comment_it?: string | null;
  comment_no?: string | null;
}

const TRANSLATION_COLUMN_BY_LANG: Record<Lang, keyof ReviewTranslationColumns> = {
  en: "comment_en",
  es: "comment_es",
  fr: "comment_fr",
  de: "comment_de",
  pt: "comment_pt",
  it: "comment_it",
  no: "comment_no",
};

export function getTranslatedCommentForLanguage(
  translations: ReviewTranslationColumns,
  lang: Lang,
): string | undefined {
  const candidate = translations[TRANSLATION_COLUMN_BY_LANG[lang]];
  if (typeof candidate !== "string") {
    return undefined;
  }
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
