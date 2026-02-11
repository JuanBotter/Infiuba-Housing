import type { Lang } from "@/types";

export const supportedLanguages: readonly Lang[] = ["en", "es", "fr", "de", "pt", "it", "no"];

export const languageLabels: Record<Lang, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  it: "Italiano",
  no: "Norsk",
};
