import type { Lang } from "@/types";

export function formatUsd(value: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "es" ? "es-AR" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "es" ? "es-AR" : "en-US", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDecimal(value: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "es" ? "es-AR" : "en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}
