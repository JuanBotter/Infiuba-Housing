import { messages } from "@/i18n/messages";
import type { Messages } from "@/i18n/messages";
import { languageLabels, supportedLanguages } from "@/lib/i18n-config";
import type { Lang } from "@/types";

export { supportedLanguages, languageLabels } from "@/lib/i18n-config";

export function isSupportedLanguage(value: string): value is Lang {
  return supportedLanguages.includes(value as Lang);
}

export function getMessages(lang: Lang) {
  return messages[lang];
}

export function pickMessages<K extends keyof Messages>(
  source: Messages,
  keys: readonly K[],
) {
  const picked = {} as Pick<Messages, K>;
  for (const key of keys) {
    picked[key] = source[key];
  }
  return picked;
}
