"use client";

import { useEffect, useState } from "react";

interface PersistedFilters {
  searchTerm?: string;
  selectedNeighborhood?: string;
  recommendedFilter?: string;
  priceMin?: string;
  priceMax?: string;
  rentSliderVersion?: number;
  minRating?: string;
  favoritesOnly?: boolean;
  sortBy?: string;
  viewMode?: "cards" | "map" | "review";
}

export type SortBy = "rating_desc" | "price_asc" | "reviews_desc" | "recent_desc";

const FILTER_STORAGE_KEY = "infiuba:filters:v2";
const RENT_SLIDER_PERSISTENCE_VERSION = 1;
const LEGACY_FILTER_STORAGE_KEYS = [
  "infiuba:filters:en",
  "infiuba:filters:es",
  "infiuba:filters:fr",
  "infiuba:filters:de",
  "infiuba:filters:pt",
  "infiuba:filters:it",
  "infiuba:filters:no",
] as const;

export function normalizeSortBy(value: string | undefined): SortBy {
  if (
    value === "rating_desc" ||
    value === "price_asc" ||
    value === "reviews_desc" ||
    value === "recent_desc"
  ) {
    return value;
  }
  return "recent_desc";
}

export function usePlaceFiltersState(canWriteReviews: boolean, isLoggedIn: boolean) {
  const [hasLoadedPersistedFilters, setHasLoadedPersistedFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNeighborhood, setSelectedNeighborhood] = useState("all");
  const [recommendedFilter, setRecommendedFilter] = useState("any");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [minRating, setMinRating] = useState("any");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("recent_desc");
  const [viewMode, setViewMode] = useState<"cards" | "map" | "review">("map");
  const [selectedMapListingId, setSelectedMapListingId] = useState<string | null>(null);
  const [isMapListOpen, setIsMapListOpen] = useState(false);

  useEffect(() => {
    try {
      let raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) {
        for (const legacyKey of LEGACY_FILTER_STORAGE_KEYS) {
          const legacyRaw = window.localStorage.getItem(legacyKey);
          if (!legacyRaw) {
            continue;
          }
          raw = legacyRaw;
          window.localStorage.setItem(FILTER_STORAGE_KEY, legacyRaw);
          break;
        }
      }

      if (!raw) {
        return;
      }

      const persisted = JSON.parse(raw) as PersistedFilters;
      const supportsRentSliderPersistence =
        persisted.rentSliderVersion === RENT_SLIDER_PERSISTENCE_VERSION;
      if (typeof persisted.searchTerm === "string") {
        setSearchTerm(persisted.searchTerm);
      }
      if (typeof persisted.selectedNeighborhood === "string") {
        setSelectedNeighborhood(persisted.selectedNeighborhood);
      }
      if (typeof persisted.recommendedFilter === "string") {
        setRecommendedFilter(persisted.recommendedFilter);
      }
      if (supportsRentSliderPersistence && typeof persisted.priceMin === "string") {
        setPriceMin(persisted.priceMin);
      }
      if (supportsRentSliderPersistence && typeof persisted.priceMax === "string") {
        setPriceMax(persisted.priceMax);
      }
      if (typeof persisted.minRating === "string") {
        setMinRating(persisted.minRating);
      }
      if (typeof persisted.favoritesOnly === "boolean") {
        setFavoritesOnly(persisted.favoritesOnly);
      }
      if (typeof persisted.sortBy === "string") {
        setSortBy(normalizeSortBy(persisted.sortBy));
      }
      if (persisted.viewMode === "cards" || persisted.viewMode === "map") {
        setViewMode(persisted.viewMode);
      } else if (persisted.viewMode === "review") {
        setViewMode(canWriteReviews ? "review" : "map");
      }
    } catch {
      // Ignore invalid persisted values.
    } finally {
      setHasLoadedPersistedFilters(true);
    }
  }, [canWriteReviews]);

  useEffect(() => {
    if (!hasLoadedPersistedFilters) {
      return;
    }

    const payload: PersistedFilters = {
      searchTerm,
      selectedNeighborhood,
      recommendedFilter,
      priceMin,
      priceMax,
      rentSliderVersion: RENT_SLIDER_PERSISTENCE_VERSION,
      minRating,
      favoritesOnly,
      sortBy,
      viewMode,
    };
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(payload));
  }, [
    minRating,
    priceMax,
    priceMin,
    recommendedFilter,
    searchTerm,
    selectedNeighborhood,
    favoritesOnly,
    sortBy,
    viewMode,
    hasLoadedPersistedFilters,
  ]);

  useEffect(() => {
    if (!isLoggedIn) {
      setFavoritesOnly(false);
    }
  }, [isLoggedIn]);

  return {
    searchTerm,
    setSearchTerm,
    selectedNeighborhood,
    setSelectedNeighborhood,
    recommendedFilter,
    setRecommendedFilter,
    priceMin,
    setPriceMin,
    priceMax,
    setPriceMax,
    minRating,
    setMinRating,
    favoritesOnly,
    setFavoritesOnly,
    sortBy,
    setSortBy,
    viewMode,
    setViewMode,
    selectedMapListingId,
    setSelectedMapListingId,
    isMapListOpen,
    setIsMapListOpen,
  };
}
