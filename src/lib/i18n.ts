import { messages } from "@/i18n/messages";
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

export function isSupportedLanguage(value: string): value is Lang {
  return supportedLanguages.includes(value as Lang);
}

export function getMessages(lang: Lang) {
  return messages[lang];
}
