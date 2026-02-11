"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { getCountryCallingCode, getCountries, type CountryCode } from "libphonenumber-js/min";

import { getLocaleForLang } from "@/lib/format";
import type { Lang } from "@/types";

interface PhoneInputWithCountryProps {
  lang: Lang;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
  pickerLabel: string;
  searchPlaceholder: string;
  noResultsLabel: string;
  numberPlaceholder: string;
}

interface CountryOption {
  code: CountryCode;
  callingCode: string;
  name: string;
  flag: string;
  searchIndex: string;
}

type SupportedCountryCode =
  | "AR"
  | "US"
  | "FR"
  | "DE"
  | "PT"
  | "IT"
  | "NO";

const fallbackCountryByLang: Record<Lang, SupportedCountryCode> = {
  en: "AR",
  es: "AR",
  fr: "FR",
  de: "DE",
  pt: "PT",
  it: "IT",
  no: "NO",
};

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function toFlagEmoji(countryCode: string) {
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return "";
  }
  return String.fromCodePoint(
    ...countryCode.split("").map((char) => 127397 + char.charCodeAt(0)),
  );
}

function getCountryName(code: CountryCode, displayNames: Intl.DisplayNames | null) {
  const localized = displayNames?.of(code);
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }
  return code;
}

function buildPhoneValue(callingCode: string, localNumber: string) {
  const trimmedLocalNumber = localNumber.trim();
  if (!trimmedLocalNumber) {
    return "";
  }
  return `+${callingCode} ${trimmedLocalNumber}`;
}

function parsePhoneValue(
  rawValue: string,
  parseCandidates: CountryOption[],
  fallbackCountry: CountryCode,
) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return { country: fallbackCountry, localNumber: "" };
  }

  const digitsOnly = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") && digitsOnly) {
    for (const candidate of parseCandidates) {
      if (!digitsOnly.startsWith(candidate.callingCode)) {
        continue;
      }
      const localNumber = digitsOnly.slice(candidate.callingCode.length);
      return { country: candidate.code, localNumber };
    }
  }

  return { country: fallbackCountry, localNumber: trimmed };
}

export function PhoneInputWithCountry({
  lang,
  value,
  onChange,
  maxLength = 120,
  disabled = false,
  pickerLabel,
  searchPlaceholder,
  noResultsLabel,
  numberPlaceholder,
}: PhoneInputWithCountryProps) {
  const locale = getLocaleForLang(lang);
  const displayNames = useMemo(() => {
    if (typeof Intl.DisplayNames === "undefined") {
      return null;
    }
    return new Intl.DisplayNames([locale], { type: "region" });
  }, [locale]);

  const countries = useMemo<CountryOption[]>(() => {
    const entries = getCountries().map((countryCode) => {
      const name = getCountryName(countryCode, displayNames);
      const callingCode = getCountryCallingCode(countryCode);
      return {
        code: countryCode,
        callingCode,
        name,
        flag: toFlagEmoji(countryCode),
        searchIndex: normalizeText(`${name} ${countryCode} +${callingCode}`),
      };
    });

    return entries.sort((left, right) => {
      const nameOrder = left.name.localeCompare(right.name, locale, { sensitivity: "base" });
      if (nameOrder !== 0) {
        return nameOrder;
      }
      return left.code.localeCompare(right.code);
    });
  }, [displayNames, locale]);

  const countryByCode = useMemo(() => {
    return new Map(countries.map((country) => [country.code, country]));
  }, [countries]);

  const parseCandidates = useMemo(() => {
    return [...countries].sort((left, right) => {
      if (left.callingCode.length !== right.callingCode.length) {
        return right.callingCode.length - left.callingCode.length;
      }
      return left.code.localeCompare(right.code);
    });
  }, [countries]);

  const fallbackCountry = useMemo<CountryCode>(() => {
    const preferred = fallbackCountryByLang[lang];
    return countryByCode.has(preferred) ? preferred : countries[0]?.code || "US";
  }, [countryByCode, countries, lang]);

  const parsedInitialValue = useMemo(
    () => parsePhoneValue(value, parseCandidates, fallbackCountry),
    [fallbackCountry, parseCandidates, value],
  );

  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(parsedInitialValue.country);
  const [localNumber, setLocalNumber] = useState(parsedInitialValue.localNumber);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const popoverId = useId();

  const selectedCountryOption =
    countryByCode.get(selectedCountry) ||
    countryByCode.get(fallbackCountry) ||
    countries[0] ||
    null;

  const filteredCountries = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    const queryDigits = query.replace(/\D/g, "");
    if (!normalizedQuery && !queryDigits) {
      return countries;
    }

    return countries.filter((country) => {
      if (normalizedQuery && country.searchIndex.includes(normalizedQuery)) {
        return true;
      }
      if (queryDigits && country.callingCode.includes(queryDigits)) {
        return true;
      }
      return false;
    });
  }, [countries, query]);

  useEffect(() => {
    const normalizedValue = value.trim();
    const composedValue = selectedCountryOption
      ? buildPhoneValue(selectedCountryOption.callingCode, localNumber)
      : localNumber.trim();
    if (normalizedValue === composedValue) {
      return;
    }

    const parsed = parsePhoneValue(value, parseCandidates, fallbackCountry);
    setSelectedCountry(parsed.country);
    setLocalNumber(parsed.localNumber);
  }, [fallbackCountry, localNumber, parseCandidates, selectedCountryOption, value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!containerRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    searchInputRef.current?.focus();
  }, [isOpen]);

  function emitValue(nextCountry: CountryCode, nextLocalNumber: string) {
    const nextCountryOption = countryByCode.get(nextCountry);
    if (!nextCountryOption) {
      onChange(nextLocalNumber.trim());
      return;
    }
    onChange(buildPhoneValue(nextCountryOption.callingCode, nextLocalNumber));
  }

  function onSelectCountry(nextCountry: CountryCode) {
    setSelectedCountry(nextCountry);
    setIsOpen(false);
    setQuery("");
    emitValue(nextCountry, localNumber);
  }

  function onLocalNumberChange(nextLocalNumberRaw: string) {
    if (!selectedCountryOption) {
      return;
    }

    const sanitized = nextLocalNumberRaw.replace(/[^\d\s()-]/g, "");
    const localMaxLength = Math.max(0, maxLength - selectedCountryOption.callingCode.length - 2);
    const nextLocalNumber = localMaxLength > 0 ? sanitized.slice(0, localMaxLength) : "";
    setLocalNumber(nextLocalNumber);
    emitValue(selectedCountry, nextLocalNumber);
  }

  if (!selectedCountryOption) {
    return (
      <input
        type="tel"
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, maxLength))}
        maxLength={maxLength}
        placeholder={numberPlaceholder}
        disabled={disabled}
      />
    );
  }

  return (
    <div className="phone-input" ref={containerRef}>
      <button
        type="button"
        className="phone-input__country-button"
        onClick={() => setIsOpen((current) => !current)}
        aria-label={pickerLabel}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={popoverId}
        disabled={disabled}
      >
        <span className="phone-input__country-flag" aria-hidden="true">
          {selectedCountryOption.flag || selectedCountryOption.code}
        </span>
        <span className="phone-input__country-code">+{selectedCountryOption.callingCode}</span>
        <span className="phone-input__country-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      <input
        className="phone-input__number"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={localNumber}
        onChange={(event) => onLocalNumberChange(event.target.value)}
        placeholder={numberPlaceholder}
        maxLength={Math.max(0, maxLength - selectedCountryOption.callingCode.length - 2)}
        disabled={disabled}
      />

      {isOpen ? (
        <div className="phone-input__popover" id={popoverId}>
          <input
            ref={searchInputRef}
            type="search"
            className="phone-input__search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setIsOpen(false);
              }
            }}
          />

          <ul className="phone-input__list" role="listbox" aria-label={pickerLabel}>
            {filteredCountries.length > 0 ? (
              filteredCountries.map((country) => (
                <li key={country.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={country.code === selectedCountry}
                    className={`phone-input__option${
                      country.code === selectedCountry ? " is-selected" : ""
                    }`}
                    onClick={() => onSelectCountry(country.code)}
                  >
                    <span className="phone-input__option-flag" aria-hidden="true">
                      {country.flag || country.code}
                    </span>
                    <span className="phone-input__option-name">{country.name}</span>
                    <span className="phone-input__option-code">+{country.callingCode}</span>
                  </button>
                </li>
              ))
            ) : (
              <li className="phone-input__empty">{noResultsLabel}</li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
