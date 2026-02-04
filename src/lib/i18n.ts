import { messages } from "@/i18n/messages";
import type { Lang } from "@/types";

export const supportedLanguages: readonly Lang[] = ["en", "es"];

export function isSupportedLanguage(value: string): value is Lang {
  return supportedLanguages.includes(value as Lang);
}

export function getMessages(lang: Lang) {
  return messages[lang];
}
