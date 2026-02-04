import type { Lang } from "@/types";

const localeByLanguage: Record<Lang, string> = {
  en: "en-US",
  es: "es-AR",
  fr: "fr-FR",
  de: "de-DE",
  pt: "pt-PT",
  it: "it-IT",
  no: "nb-NO",
};

export function getLocaleForLang(lang: Lang) {
  return localeByLanguage[lang] || "en-US";
}

export function formatUsd(value: number, lang: Lang) {
  return new Intl.NumberFormat(getLocaleForLang(lang), {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number, lang: Lang) {
  return new Intl.NumberFormat(getLocaleForLang(lang), {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDecimal(value: number, lang: Lang) {
  return new Intl.NumberFormat(getLocaleForLang(lang), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}
