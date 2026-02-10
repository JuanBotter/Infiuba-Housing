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

export function formatNumber(value: number, lang: Lang) {
  return new Intl.NumberFormat(getLocaleForLang(lang), {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatUsdAmount(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatUsd(value: number, lang: Lang) {
  return new Intl.NumberFormat(getLocaleForLang(lang), {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatUsdRange(
  values: { min?: number; max?: number; fallback?: number },
  lang: Lang,
) {
  const { min, max, fallback } = values;

  if (typeof min === "number" && typeof max === "number") {
    if (Math.abs(min - max) < 0.000001) {
      return formatUsd(min, lang);
    }
    return `${formatUsd(min, lang)} - ${formatUsd(max, lang)}`;
  }

  if (typeof min === "number") {
    return formatUsd(min, lang);
  }
  if (typeof max === "number") {
    return formatUsd(max, lang);
  }
  if (typeof fallback === "number") {
    return formatUsd(fallback, lang);
  }

  return undefined;
}

export function formatUsdRangePlain(
  values: { min?: number; max?: number; fallback?: number },
  _lang: Lang,
) {
  const { min, max, fallback } = values;

  if (typeof min === "number" && typeof max === "number") {
    if (Math.abs(min - max) < 0.000001) {
      return formatUsdAmount(min);
    }
    return `${formatUsdAmount(min)} - ${formatUsdAmount(max)}`;
  }

  if (typeof min === "number") {
    return formatUsdAmount(min);
  }
  if (typeof max === "number") {
    return formatUsdAmount(max);
  }
  if (typeof fallback === "number") {
    return formatUsdAmount(fallback);
  }

  return undefined;
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
