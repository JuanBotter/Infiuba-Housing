"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { AddStayReviewForm } from "@/app/[lang]/add-stay-review-form";
import { MapListingSidebarItem } from "@/app/[lang]/map-listing-sidebar-item";
import {
  getListingMinReviewPrice,
  hasReviewPriceInRange,
} from "@/app/[lang]/place-filters-price";
import { ReviewComment } from "@/app/[lang]/place/[id]/review-comment";
import { ReviewForm } from "@/app/[lang]/place/[id]/review-form";
import { ContactEditRequestForm } from "@/components/contact-edit-request-form";
import { splitContactParts } from "@/lib/contact-links";
import { formatDecimal, formatPercent, formatUsdAmount, formatUsdRangePlain } from "@/lib/format";
import { splitReviewerContactParts } from "@/lib/reviewer-contact";
import type { Messages } from "@/i18n/messages";
import type { Lang, Listing } from "@/types";

const ListingsMap = dynamic(
  () => import("@/app/[lang]/listings-map").then((module) => module.ListingsMap),
  { ssr: false },
);

interface PlaceFiltersProps {
  lang: Lang;
  messages: Messages;
  listings: Listing[];
  neighborhoods: string[];
  canViewOwnerInfo: boolean;
  canWriteReviews: boolean;
  isLoggedIn: boolean;
  isAdmin: boolean;
}

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

type SortBy = "rating_desc" | "price_asc" | "reviews_desc" | "recent_desc";
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
type ActiveFilterId =
  | "search"
  | "neighborhood"
  | "recommended"
  | "priceMin"
  | "priceMax"
  | "minRating"
  | "favoritesOnly"
  | "sort";

interface ActiveFilterChip {
  id: ActiveFilterId;
  label: string;
}

type OverlapDragMode = "none" | "moveMin" | "moveMax";

function clampToRange(value: number, minValue: number, maxValue: number) {
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}

function normalizeSortBy(value: string | undefined): SortBy {
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

function renderContactValue(contact: string) {
  return splitContactParts(contact).map((part, index) => {
    if (part.type === "link") {
      const isExternal = part.kind === "url";
      return (
        <a
          key={`${part.text}-${index}`}
          href={part.href}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noreferrer" : undefined}
        >
          {part.text}
        </a>
      );
    }
    return <span key={`${part.text}-${index}`}>{part.text}</span>;
  });
}

export function PlaceFilters({
  lang,
  messages,
  listings,
  neighborhoods,
  canViewOwnerInfo,
  canWriteReviews,
  isLoggedIn,
  isAdmin,
}: PlaceFiltersProps) {
  const [hasLoadedPersistedFilters, setHasLoadedPersistedFilters] = useState(false);
  const mapListItemRefs = useRef<Record<string, HTMLElement | null>>({});
  const mapRailItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
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
  const [favoriteListingIds, setFavoriteListingIds] = useState<string[]>([]);
  const [favoritePendingListingIds, setFavoritePendingListingIds] = useState<string[]>([]);
  const [favoriteActionError, setFavoriteActionError] = useState("");
  const previousSortByRef = useRef<SortBy>(sortBy);
  const overlapDragModeRef = useRef<OverlapDragMode>("none");
  const overlapDragAnchorRef = useRef<number | null>(null);

  const favoriteListingIdSet = useMemo(() => new Set(favoriteListingIds), [favoriteListingIds]);
  const favoritePendingListingIdSet = useMemo(
    () => new Set(favoritePendingListingIds),
    [favoritePendingListingIds],
  );

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
      setFavoriteListingIds([]);
      setFavoritePendingListingIds([]);
      setFavoritesOnly(false);
      return;
    }

    let cancelled = false;

    async function loadFavorites() {
      try {
        const response = await fetch("/api/favorites");
        if (!response.ok) {
          setFavoriteActionError(messages.accessUnknownError);
          return;
        }

        const payload = (await response.json()) as { listingIds?: string[] };
        if (cancelled) {
          return;
        }

        if (!Array.isArray(payload.listingIds)) {
          setFavoriteListingIds([]);
          return;
        }

        const normalized = payload.listingIds
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean);
        setFavoriteListingIds(Array.from(new Set(normalized)));
        setFavoriteActionError("");
      } catch {
        // Keep UI functional even when favorites cannot be loaded.
        setFavoriteActionError(messages.accessUnknownError);
      }
    }

    void loadFavorites();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, messages.accessUnknownError]);

  const priceBounds = useMemo(() => {
    const allReviewPrices: number[] = [];
    let minPrice = Number.POSITIVE_INFINITY;
    let maxPrice = Number.NEGATIVE_INFINITY;

    for (const listing of listings) {
      for (const rawPrice of listing.reviewPrices || []) {
        if (!Number.isFinite(rawPrice)) {
          continue;
        }
        allReviewPrices.push(rawPrice);
        minPrice = Math.min(minPrice, rawPrice);
        maxPrice = Math.max(maxPrice, rawPrice);
      }
    }

    if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
      return null;
    }

    const min = Math.floor(minPrice);
    const max = Math.ceil(maxPrice);
    const hasPriceAtLowerBound = allReviewPrices.some((price) => Math.abs(price - min) < 0.000001);

    return {
      min,
      max,
      hasPriceAtLowerBound,
    };
  }, [listings]);

  const priceSliderStep = 1;
  const priceMinNoFilterValue = useMemo(() => {
    if (!priceBounds) {
      return 0;
    }
    return priceBounds.hasPriceAtLowerBound
      ? priceBounds.min
      : priceBounds.min + priceSliderStep;
  }, [priceBounds]);

  const effectivePriceRange = useMemo(() => {
    if (!priceBounds) {
      return {
        sliderMin: 0,
        sliderMax: 0,
        hasMin: false,
        hasMax: false,
        minFilter: undefined as number | undefined,
        maxFilter: undefined as number | undefined,
      };
    }

    const parsedMin = Number(priceMin);
    const parsedMax = Number(priceMax);
    const hasStoredMin = priceMin !== "" && Number.isFinite(parsedMin);
    const hasStoredMax = priceMax !== "" && Number.isFinite(parsedMax);
    let sliderMin = hasStoredMin
      ? clampToRange(Math.round(parsedMin), priceBounds.min, priceBounds.max)
      : priceBounds.min;
    let sliderMax = hasStoredMax
      ? clampToRange(Math.round(parsedMax), priceBounds.min, priceBounds.max)
      : priceBounds.max;

    if (sliderMin > sliderMax) {
      [sliderMin, sliderMax] = [sliderMax, sliderMin];
    }

    const hasMin = sliderMin > priceMinNoFilterValue;
    const hasMax = sliderMax < priceBounds.max;

    return {
      sliderMin,
      sliderMax,
      hasMin,
      hasMax,
      minFilter: hasMin ? sliderMin : undefined,
      maxFilter: hasMax ? sliderMax : undefined,
    };
  }, [priceBounds, priceMax, priceMin, priceMinNoFilterValue]);

  const priceRangePercents = useMemo(() => {
    if (!priceBounds) {
      return {
        start: 0,
        end: 100,
      };
    }

    const rangeSpan = Math.max(priceBounds.max - priceBounds.min, 1);
    const startPercent =
      ((effectivePriceRange.sliderMin - priceBounds.min) / rangeSpan) * 100;
    const endPercent = ((effectivePriceRange.sliderMax - priceBounds.min) / rangeSpan) * 100;

    return {
      start: startPercent,
      end: endPercent,
    };
  }, [effectivePriceRange.sliderMax, effectivePriceRange.sliderMin, priceBounds]);

  const priceRangeTrackStyle = useMemo(() => {
    return {
      "--start-percent": `${priceRangePercents.start}%`,
      "--end-percent": `${priceRangePercents.end}%`,
    } as CSSProperties;
  }, [priceRangePercents.end, priceRangePercents.start]);

  const priceHistogram = useMemo(() => {
    type HistogramBar = { id: number; heightPercent: number; isActive: boolean };
    if (!priceBounds) {
      return [] as HistogramBar[];
    }

    const allReviewPrices: number[] = [];
    for (const listing of listings) {
      for (const rawPrice of listing.reviewPrices || []) {
        if (!Number.isFinite(rawPrice)) {
          continue;
        }
        allReviewPrices.push(rawPrice);
      }
    }

    if (allReviewPrices.length === 0) {
      return [] as HistogramBar[];
    }

    const binCount = Math.min(28, Math.max(10, Math.round(Math.sqrt(allReviewPrices.length) * 1.8)));
    const counts = Array.from({ length: binCount }, () => 0);
    const rangeSpan = Math.max(priceBounds.max - priceBounds.min, 1);

    for (const price of allReviewPrices) {
      const normalized = (price - priceBounds.min) / rangeSpan;
      const binIndex = Math.min(binCount - 1, Math.max(0, Math.floor(normalized * binCount)));
      counts[binIndex] += 1;
    }

    const maxBinCount = Math.max(...counts);
    if (maxBinCount <= 0) {
      return [] as HistogramBar[];
    }

    return counts.map((count, index) => {
      const centerPercent = ((index + 0.5) / binCount) * 100;
      return {
        id: index,
        heightPercent: count > 0 ? Math.max(14, Math.round((count / maxBinCount) * 100)) : 0,
        isActive:
          centerPercent >= priceRangePercents.start && centerPercent <= priceRangePercents.end,
      };
    });
  }, [listings, priceBounds, priceRangePercents.end, priceRangePercents.start]);

  const filtered = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const minRatingValue = Number(minRating);
    const hasMinRating = minRating !== "any" && Number.isFinite(minRatingValue);

    return listings.filter((listing) => {
      const searchMatch =
        !normalizedSearch ||
        listing.address.toLowerCase().includes(normalizedSearch) ||
        listing.neighborhood.toLowerCase().includes(normalizedSearch);

      const neighborhoodMatch =
        selectedNeighborhood === "all" || listing.neighborhood === selectedNeighborhood;

      const recommendationMatch =
        recommendedFilter === "any" ||
        (recommendedFilter === "yes" && (listing.recommendationRate ?? 0) >= 0.5) ||
        (recommendedFilter === "no" && (listing.recommendationRate ?? 0) < 0.5);

      const hasReviewPrices =
        Array.isArray(listing.reviewPrices) &&
        listing.reviewPrices.some((price) => Number.isFinite(price));
      const priceRangeMatch =
        !hasReviewPrices && !effectivePriceRange.hasMin
          ? true
          : !effectivePriceRange.hasMin && !effectivePriceRange.hasMax
          ? true
          : hasReviewPriceInRange(
              listing,
              effectivePriceRange.minFilter,
              effectivePriceRange.maxFilter,
            );

      const minRatingMatch =
        !hasMinRating ||
        (typeof listing.averageRating === "number" && listing.averageRating >= minRatingValue);
      const favoritesMatch = !favoritesOnly || favoriteListingIdSet.has(listing.id);

      return (
        searchMatch &&
        neighborhoodMatch &&
        recommendationMatch &&
        priceRangeMatch &&
        minRatingMatch &&
        favoritesMatch
      );
    });
  }, [
    effectivePriceRange.hasMax,
    effectivePriceRange.hasMin,
    effectivePriceRange.maxFilter,
    effectivePriceRange.minFilter,
    favoriteListingIdSet,
    favoritesOnly,
    listings,
    minRating,
    recommendedFilter,
    searchTerm,
    selectedNeighborhood,
  ]);

  const filteredAndSorted = useMemo(() => {
    const sorted = [...filtered];

    const numberCompare = (
      left: number | undefined,
      right: number | undefined,
      direction: "asc" | "desc",
    ) => {
      if (left === undefined && right === undefined) {
        return 0;
      }
      if (left === undefined) {
        return 1;
      }
      if (right === undefined) {
        return -1;
      }
      return direction === "asc" ? left - right : right - left;
    };

    sorted.sort((left, right) => {
      if (sortBy === "rating_desc") {
        const ratingOrder = numberCompare(left.averageRating, right.averageRating, "desc");
        if (ratingOrder !== 0) {
          return ratingOrder;
        }
        return right.totalReviews - left.totalReviews;
      }

      if (sortBy === "price_asc") {
        const priceOrder = numberCompare(
          getListingMinReviewPrice(left),
          getListingMinReviewPrice(right),
          "asc",
        );
        if (priceOrder !== 0) {
          return priceOrder;
        }
      }

      if (sortBy === "reviews_desc") {
        const reviewsOrder = right.totalReviews - left.totalReviews;
        if (reviewsOrder !== 0) {
          return reviewsOrder;
        }
      }

      if (sortBy === "recent_desc") {
        const recentOrder = numberCompare(left.recentYear, right.recentYear, "desc");
        if (recentOrder !== 0) {
          return recentOrder;
        }
      }

      return left.address.localeCompare(right.address, undefined, { sensitivity: "base" });
    });

    return sorted;
  }, [filtered, sortBy]);

  useEffect(() => {
    if (filteredAndSorted.length === 0) {
      setSelectedMapListingId(null);
      previousSortByRef.current = sortBy;
      return;
    }

    const sortChanged = previousSortByRef.current !== sortBy;
    previousSortByRef.current = sortBy;
    if (sortChanged && viewMode === "map") {
      setSelectedMapListingId(filteredAndSorted[0].id);
      return;
    }

    const selectedStillExists = filteredAndSorted.some(
      (listing) => listing.id === selectedMapListingId,
    );
    if (!selectedMapListingId || !selectedStillExists) {
      setSelectedMapListingId(filteredAndSorted[0].id);
    }
  }, [filteredAndSorted, selectedMapListingId, sortBy, viewMode]);

  useEffect(() => {
    if (viewMode !== "map") {
      setIsMapListOpen(false);
    }
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "map" || !selectedMapListingId) {
      return;
    }

    const selectedListItem = mapListItemRefs.current[selectedMapListingId];
    if (selectedListItem && selectedListItem.offsetParent !== null) {
      selectedListItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    const selectedRailItem = mapRailItemRefs.current[selectedMapListingId];
    if (selectedRailItem && selectedRailItem.offsetParent !== null) {
      selectedRailItem.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selectedMapListingId, viewMode]);

  const selectedMapListing =
    filteredAndSorted.find((listing) => listing.id === selectedMapListingId) ||
    filteredAndSorted[0] ||
    null;
  const selectedMapListingIsFavorite = selectedMapListing
    ? favoriteListingIdSet.has(selectedMapListing.id)
    : false;
  const selectedMapListingFavoritePending = selectedMapListing
    ? favoritePendingListingIdSet.has(selectedMapListing.id)
    : false;
  const selectedMapQuery = selectedMapListing
    ? encodeURIComponent(
        `${selectedMapListing.address}, ${selectedMapListing.neighborhood}, Buenos Aires, Argentina`,
      )
    : "";
  const selectedMapReviews = selectedMapListing
    ? selectedMapListing.reviews
        .filter((review) => typeof review.comment === "string" && review.comment.trim().length > 0)
        .slice(0, 3)
    : [];
  const isReviewMode = viewMode === "review";

  const activeFilters = useMemo(() => {
    const chips: ActiveFilterChip[] = [];

    if (searchTerm.trim()) {
      chips.push({ id: "search", label: `${messages.searchLabel}: ${searchTerm.trim()}` });
    }

    if (selectedNeighborhood !== "all") {
      chips.push({
        id: "neighborhood",
        label: `${messages.neighborhoodLabel}: ${selectedNeighborhood}`,
      });
    }

    if (recommendedFilter === "yes") {
      chips.push({
        id: "recommended",
        label: `${messages.recommendationLabel}: ${messages.recommendationYes}`,
      });
    } else if (recommendedFilter === "no") {
      chips.push({
        id: "recommended",
        label: `${messages.recommendationLabel}: ${messages.recommendationNo}`,
      });
    }

    if (effectivePriceRange.hasMin && typeof effectivePriceRange.minFilter === "number") {
      chips.push({
        id: "priceMin",
        label: `${messages.filterPriceMinLabel}: ${formatUsdAmount(effectivePriceRange.minFilter)}`,
      });
    }

    if (effectivePriceRange.hasMax && typeof effectivePriceRange.maxFilter === "number") {
      chips.push({
        id: "priceMax",
        label: `${messages.filterPriceMaxLabel}: ${formatUsdAmount(effectivePriceRange.maxFilter)}`,
      });
    }

    if (minRating !== "any" && Number.isFinite(Number(minRating))) {
      chips.push({ id: "minRating", label: `${messages.filterMinRatingLabel}: ${minRating}+` });
    }

    if (favoritesOnly) {
      chips.push({ id: "favoritesOnly", label: messages.favoriteFilterOnly });
    }

    if (sortBy !== "recent_desc") {
      const sortLabelMap: Record<SortBy, string> = {
        rating_desc: messages.sortRatingDesc,
        price_asc: messages.sortPriceAsc,
        reviews_desc: messages.sortReviewsDesc,
        recent_desc: messages.sortRecentDesc,
      };
      chips.push({ id: "sort", label: `${messages.sortLabel}: ${sortLabelMap[sortBy]}` });
    }

    return chips;
  }, [
    effectivePriceRange.hasMax,
    effectivePriceRange.hasMin,
    effectivePriceRange.maxFilter,
    effectivePriceRange.minFilter,
    messages.favoriteFilterOnly,
    messages.filterMinRatingLabel,
    messages.filterPriceMaxLabel,
    messages.filterPriceMinLabel,
    messages.neighborhoodLabel,
    messages.recommendationLabel,
    messages.recommendationNo,
    messages.recommendationYes,
    messages.searchLabel,
    messages.sortLabel,
    messages.sortPriceAsc,
    messages.sortRatingDesc,
    messages.sortRecentDesc,
    messages.sortReviewsDesc,
    favoritesOnly,
    minRating,
    recommendedFilter,
    searchTerm,
    selectedNeighborhood,
    sortBy,
  ]);

  function clearSingleFilter(id: ActiveFilterId) {
    if (id === "search") {
      setSearchTerm("");
      return;
    }
    if (id === "neighborhood") {
      setSelectedNeighborhood("all");
      return;
    }
    if (id === "recommended") {
      setRecommendedFilter("any");
      return;
    }
    if (id === "priceMin") {
      setPriceMin("");
      return;
    }
    if (id === "priceMax") {
      setPriceMax("");
      return;
    }
    if (id === "minRating") {
      setMinRating("any");
      return;
    }
    if (id === "favoritesOnly") {
      setFavoritesOnly(false);
      return;
    }
    setSortBy("recent_desc");
  }

  function clearFilters() {
    setSearchTerm("");
    setSelectedNeighborhood("all");
    setRecommendedFilter("any");
    setPriceMin("");
    setPriceMax("");
    setMinRating("any");
    setFavoritesOnly(false);
    setSortBy("recent_desc");
  }

  function startPriceSliderDrag() {
    if (effectivePriceRange.sliderMin === effectivePriceRange.sliderMax) {
      overlapDragAnchorRef.current = effectivePriceRange.sliderMin;
      overlapDragModeRef.current = "none";
      return;
    }
    overlapDragAnchorRef.current = null;
    overlapDragModeRef.current = "none";
  }

  function endPriceSliderDrag() {
    overlapDragAnchorRef.current = null;
    overlapDragModeRef.current = "none";
  }

  function applyOverlapAwarePriceChange(nextValue: number) {
    if (!priceBounds) {
      return false;
    }

    const anchorValue = overlapDragAnchorRef.current;
    if (anchorValue === null) {
      return false;
    }

    let mode = overlapDragModeRef.current;
    if (mode === "none") {
      if (nextValue < anchorValue) {
        mode = "moveMin";
      } else if (nextValue > anchorValue) {
        mode = "moveMax";
      } else {
        return true;
      }
      overlapDragModeRef.current = mode;
    }

    if (mode === "moveMin") {
      const boundedValue = Math.min(nextValue, anchorValue);
      setPriceMin(boundedValue <= priceMinNoFilterValue ? "" : String(boundedValue));
      setPriceMax(anchorValue >= priceBounds.max ? "" : String(anchorValue));
      return true;
    }

    const boundedValue = Math.max(nextValue, anchorValue);
    setPriceMax(boundedValue >= priceBounds.max ? "" : String(boundedValue));
    setPriceMin(anchorValue <= priceMinNoFilterValue ? "" : String(anchorValue));
    return true;
  }

  function handleMinPriceSliderChange(nextValueRaw: number) {
    if (!priceBounds) {
      return;
    }
    const nextValue = clampToRange(Math.round(nextValueRaw), priceBounds.min, priceBounds.max);
    if (applyOverlapAwarePriceChange(nextValue)) {
      return;
    }

    const { sliderMax } = effectivePriceRange;
    const boundedValue = Math.min(nextValue, sliderMax);
    setPriceMin(boundedValue <= priceMinNoFilterValue ? "" : String(boundedValue));
  }

  function handleMaxPriceSliderChange(nextValueRaw: number) {
    if (!priceBounds) {
      return;
    }
    const nextValue = clampToRange(Math.round(nextValueRaw), priceBounds.min, priceBounds.max);
    if (applyOverlapAwarePriceChange(nextValue)) {
      return;
    }

    const { sliderMin } = effectivePriceRange;
    const boundedValue = Math.max(nextValue, sliderMin);
    setPriceMax(boundedValue >= priceBounds.max ? "" : String(boundedValue));
  }

  function getFavoriteAriaLabel(isFavorite: boolean) {
    if (!isLoggedIn) {
      return messages.favoriteLoginHint;
    }
    return isFavorite ? messages.favoriteRemove : messages.favoriteAdd;
  }

  async function toggleFavorite(listingId: string) {
    if (!isLoggedIn) {
      setFavoriteActionError(messages.favoriteLoginHint);
      return;
    }

    if (favoritePendingListingIdSet.has(listingId)) {
      return;
    }

    const isFavorite = favoriteListingIdSet.has(listingId);
    setFavoritePendingListingIds((current) => [...current, listingId]);
    setFavoriteActionError("");

    try {
      const response = await fetch("/api/favorites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: isFavorite ? "remove" : "add",
          listingId,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setFavoriteActionError(messages.favoriteLoginHint);
        } else if (response.status === 503) {
          setFavoriteActionError(messages.accessLoginUnavailableError);
        } else {
          setFavoriteActionError(messages.accessUnknownError);
        }
        return;
      }

      const payload = (await response.json().catch(() => null)) as { favorite?: boolean } | null;
      const nextFavoriteValue = typeof payload?.favorite === "boolean" ? payload.favorite : !isFavorite;

      setFavoriteListingIds((current) => {
        const next = new Set(current);
        if (nextFavoriteValue) {
          next.add(listingId);
        } else {
          next.delete(listingId);
        }
        return Array.from(next);
      });
    } catch {
      // Ignore transient save errors; user can retry from the same control.
      setFavoriteActionError(messages.accessUnknownError);
    } finally {
      setFavoritePendingListingIds((current) => current.filter((id) => id !== listingId));
    }
  }

  return (
    <>
      <section className="view-toggle" aria-label={messages.viewModeLabel}>
        <button
          type="button"
          className={`view-toggle__button ${viewMode === "map" ? "is-active" : ""}`}
          onClick={() => setViewMode("map")}
        >
          {messages.viewMap}
        </button>
        <button
          type="button"
          className={`view-toggle__button ${viewMode === "cards" ? "is-active" : ""}`}
          onClick={() => setViewMode("cards")}
        >
          {messages.viewCards}
        </button>
        {canWriteReviews ? (
          <button
            type="button"
            className={`view-toggle__button ${viewMode === "review" ? "is-active" : ""}`}
            onClick={() => setViewMode("review")}
          >
            {messages.viewAddReview}
          </button>
        ) : null}
      </section>

      {!isReviewMode ? (
        <>
          <section className="filters-panel">
            <label>
              <span>{messages.searchLabel}</span>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={messages.searchPlaceholder}
              />
            </label>

            <label>
              <span>{messages.neighborhoodLabel}</span>
              <select
                value={selectedNeighborhood}
                onChange={(event) => setSelectedNeighborhood(event.target.value)}
              >
                <option value="all">{messages.neighborhoodAll}</option>
                {neighborhoods.map((neighborhood) => (
                  <option key={neighborhood} value={neighborhood}>
                    {neighborhood}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>{messages.recommendationLabel}</span>
              <select
                value={recommendedFilter}
                onChange={(event) => setRecommendedFilter(event.target.value)}
              >
                <option value="any">{messages.recommendationAll}</option>
                <option value="yes">{messages.recommendationYes}</option>
                <option value="no">{messages.recommendationNo}</option>
              </select>
            </label>

            {priceBounds ? (
              <label className="filters-panel__range filters-panel__item--range">
                <span>{messages.priceLabel}</span>
                <div className="filters-panel__range-values">
                  <p className="filters-panel__range-value">
                    {messages.filterPriceMinLabel}: {formatUsdAmount(effectivePriceRange.sliderMin)}
                  </p>
                  <p className="filters-panel__range-value filters-panel__range-value--right">
                    {messages.filterPriceMaxLabel}: {formatUsdAmount(effectivePriceRange.sliderMax)}
                  </p>
                </div>
                <div className="filters-panel__range-slider" style={priceRangeTrackStyle}>
                  <div className="filters-panel__range-histogram" aria-hidden="true">
                    {priceHistogram.map((bar) => (
                      <span
                        key={bar.id}
                        className={`filters-panel__range-bar${bar.isActive ? " is-active" : ""}`}
                        style={{ "--bar-height": `${bar.heightPercent}%` } as CSSProperties}
                      />
                    ))}
                  </div>
                  <input
                    className="filters-panel__range-input filters-panel__range-input--min"
                    type="range"
                    min={priceBounds.min}
                    max={priceBounds.max}
                    step={priceSliderStep}
                    value={effectivePriceRange.sliderMin}
                    onChange={(event) => handleMinPriceSliderChange(Number(event.target.value))}
                    onPointerDown={startPriceSliderDrag}
                    onPointerUp={endPriceSliderDrag}
                    onPointerCancel={endPriceSliderDrag}
                    onBlur={endPriceSliderDrag}
                    aria-label={messages.filterPriceMinLabel}
                  />
                  <input
                    className="filters-panel__range-input filters-panel__range-input--max"
                    type="range"
                    min={priceBounds.min}
                    max={priceBounds.max}
                    step={priceSliderStep}
                    value={effectivePriceRange.sliderMax}
                    onChange={(event) => handleMaxPriceSliderChange(Number(event.target.value))}
                    onPointerDown={startPriceSliderDrag}
                    onPointerUp={endPriceSliderDrag}
                    onPointerCancel={endPriceSliderDrag}
                    onBlur={endPriceSliderDrag}
                    aria-label={messages.filterPriceMaxLabel}
                  />
                </div>
              </label>
            ) : null}

            <label className="filters-panel__item--min-rating">
              <span>{messages.filterMinRatingLabel}</span>
              <select value={minRating} onChange={(event) => setMinRating(event.target.value)}>
                <option value="any">{messages.filterMinRatingAny}</option>
                <option value="2">2+</option>
                <option value="3">3+</option>
                <option value="3.5">3.5+</option>
                <option value="4">4+</option>
                <option value="4.5">4.5+</option>
              </select>
            </label>

            <label className="filters-panel__item--sort">
              <span>{messages.sortLabel}</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(normalizeSortBy(event.target.value))}
              >
                <option value="recent_desc">{messages.sortRecentDesc}</option>
                <option value="rating_desc">{messages.sortRatingDesc}</option>
                <option value="price_asc">{messages.sortPriceAsc}</option>
                <option value="reviews_desc">{messages.sortReviewsDesc}</option>
              </select>
            </label>

            <label
              className={`filters-panel__toggle filters-panel__item--favorites${!isLoggedIn ? " is-disabled" : ""}`}
              title={!isLoggedIn ? messages.favoriteLoginHint : undefined}
            >
              <input
                type="checkbox"
                checked={favoritesOnly}
                onChange={(event) => setFavoritesOnly(event.target.checked)}
                disabled={!isLoggedIn}
              />
              <span className="filters-panel__toggle-slider" aria-hidden="true" />
              <span className="filters-panel__toggle-label">{messages.favoriteFilterOnly}</span>
            </label>
          </section>

          <section className="filters-summary">
            <p className="result-count">
              {filteredAndSorted.length} {messages.resultsLabel}
            </p>
            <div
              className={`active-filters active-filters--inline${activeFilters.length === 0 ? " is-empty" : ""}`}
              aria-hidden={activeFilters.length === 0}
            >
              <p className="active-filters__label">{messages.activeFiltersLabel}</p>
              <div className="active-filters__list">
                {activeFilters.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className="active-filters__chip"
                    onClick={() => clearSingleFilter(chip.id)}
                    aria-label={chip.label}
                  >
                    {chip.label}
                    <span className="active-filters__chip-close" aria-hidden="true">
                      ×
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="active-filters__clear"
                onClick={clearFilters}
                disabled={activeFilters.length === 0}
              >
                {messages.clearFilters}
              </button>
            </div>
          </section>
          {favoriteActionError ? <p className="form-status error">{favoriteActionError}</p> : null}
        </>
      ) : null}

      {isReviewMode ? (
        <AddStayReviewForm lang={lang} listings={listings} neighborhoods={neighborhoods} />
      ) : filteredAndSorted.length === 0 ? (
        <p className="empty-state">{messages.noResults}</p>
      ) : viewMode === "cards" ? (
        <section className="cards-grid">
          {filteredAndSorted.map((listing) => {
            const priceText = formatUsdRangePlain(
              {
                min: listing.minPriceUsd,
                max: listing.maxPriceUsd,
              },
              lang,
            );
            const priceTextDisplay = priceText || "-";
            const ratingText =
              typeof listing.averageRating === "number"
                ? formatDecimal(listing.averageRating, lang)
                : "-";
            const isFavorite = favoriteListingIdSet.has(listing.id);
            const isFavoritePending = favoritePendingListingIdSet.has(listing.id);
            const favoriteAriaLabel = getFavoriteAriaLabel(isFavorite);

            return (
              <div key={listing.id} className="place-card-stack">
                <article className="place-card">
                  <div className="place-card__media">
                    <Link
                      href={`/${lang}/place/${listing.id}`}
                      className="place-card__media-link"
                      aria-label={`${listing.address}, ${listing.neighborhood}`}
                    >
                      {listing.imageUrls?.[0] ? (
                        <img
                          src={listing.imageUrls[0]}
                          alt={`${listing.address} · ${messages.imageAltProperty}`}
                          loading="lazy"
                        />
                      ) : (
                        <div className="place-card__media-placeholder" aria-hidden="true" />
                      )}
                    </Link>
                    <div className="place-card__media-overlay" aria-hidden="true">
                      <div className="place-card__overlay-pills">
                        <p className="place-card__overlay-pill">{listing.neighborhood}</p>
                        <p className="place-card__overlay-pill">{priceTextDisplay}</p>
                        <p className="place-card__overlay-pill">★ {ratingText}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`place-card__favorite-button${isFavorite ? " is-active" : ""}`}
                      aria-pressed={isFavorite}
                      aria-label={favoriteAriaLabel}
                      title={favoriteAriaLabel}
                      disabled={isFavoritePending}
                      onClick={() => void toggleFavorite(listing.id)}
                    >
                      <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
                        <path d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.5L12 21.35Z" />
                      </svg>
                    </button>
                  </div>
                  <div className="place-card__head">
                    <div className="place-card__meta">
                      <p className="place-card__neighborhood">{listing.neighborhood}</p>
                      <p className="place-card__reviews-badge">
                        {listing.totalReviews} {messages.reviewsLabel}
                      </p>
                    </div>
                    <h2>
                      <Link href={`/${lang}/place/${listing.id}`} className="place-card__title-link">
                        {listing.address}
                      </Link>
                    </h2>
                  </div>

                  <div className="place-card__stats">
                    <p className="stat-chip">
                      <span>{messages.ratingLabel}</span>
                      <strong>{ratingText}</strong>
                    </p>
                    <p className="stat-chip">
                      <span>{messages.recommendationRateLabel}</span>
                      <strong>
                        {typeof listing.recommendationRate === "number"
                          ? formatPercent(listing.recommendationRate, lang)
                          : "-"}
                      </strong>
                    </p>
                    <p className="stat-chip">
                      <span>{messages.priceLabel}</span>
                      <strong>{priceTextDisplay}</strong>
                    </p>
                    <p className="stat-chip">
                      <span>{messages.capacityLabel}</span>
                      <strong>
                        {typeof listing.capacity === "number"
                          ? `${Math.round(listing.capacity)} ${messages.studentsSuffix}`
                          : "-"}
                      </strong>
                    </p>
                  </div>
                </article>
                {isAdmin ? (
                  <Link
                    href={`/${lang}/admin/publications?listingId=${listing.id}`}
                    className="inline-link"
                  >
                    {messages.adminEditListing}
                  </Link>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : (
        <section className="map-layout">
          {isMapListOpen ? (
            <button
              type="button"
              className="map-layout__backdrop"
              onClick={() => setIsMapListOpen(false)}
              aria-label={messages.mapListClose}
            />
          ) : null}

          <aside className={`map-layout__list ${isMapListOpen ? "is-open" : ""}`}>
            <div className="map-layout__list-header">
              <p>
                {filteredAndSorted.length} {messages.resultsLabel}
              </p>
              <button type="button" onClick={() => setIsMapListOpen(false)}>
                {messages.mapListClose}
              </button>
            </div>
            {filteredAndSorted.map((listing) => {
              const isSelected = selectedMapListing?.id === listing.id;
              const isFavorite = favoriteListingIdSet.has(listing.id);
              const isFavoritePending = favoritePendingListingIdSet.has(listing.id);
              return (
                <MapListingSidebarItem
                  key={listing.id}
                  lang={lang}
                  listing={listing}
                  messages={messages}
                  isSelected={isSelected}
                  isFavorite={isFavorite}
                  isFavoritePending={isFavoritePending}
                  favoriteAriaLabel={getFavoriteAriaLabel(isFavorite)}
                  adminEditHref={
                    isAdmin ? `/${lang}/admin/publications?listingId=${listing.id}` : undefined
                  }
                  adminEditLabel={isAdmin ? messages.adminEditListing : undefined}
                  registerRef={(element) => {
                    mapListItemRefs.current[listing.id] = element;
                  }}
                  onSelect={() => {
                    setSelectedMapListingId(listing.id);
                    setIsMapListOpen(false);
                  }}
                  onToggleFavorite={() => toggleFavorite(listing.id)}
                />
              );
            })}
          </aside>

          <div className="map-layout__panel">
            <p className="map-layout__hint">{messages.mapViewHint}</p>
            {selectedMapListing ? (
              <>
                <h3>{selectedMapListing.address}</h3>
                <p>{selectedMapListing.neighborhood}</p>
                <ListingsMap
                  lang={lang}
                  listings={filteredAndSorted}
                  selectedListingId={selectedMapListing.id}
                  onSelectListing={setSelectedMapListingId}
                />
                <a
                  className="button-link"
                  href={`https://www.google.com/maps/search/?api=1&query=${selectedMapQuery}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {messages.openInMaps}
                </a>

                <section className="map-mobile-rail">
                  <p className="map-mobile-rail__hint">{messages.mapMobileRailHint}</p>
                  <div className="map-mobile-rail__track">
                    {filteredAndSorted.map((listing) => {
                      const isSelected = selectedMapListing?.id === listing.id;
                      const ratingText =
                        typeof listing.averageRating === "number"
                          ? formatDecimal(listing.averageRating, lang)
                          : "-";
                      const isFavorite = favoriteListingIdSet.has(listing.id);
                      return (
                        <button
                          key={listing.id}
                          type="button"
                          ref={(element) => {
                            mapRailItemRefs.current[listing.id] = element;
                          }}
                          className={`map-mobile-rail__item ${isSelected ? "is-selected" : ""}`}
                          onClick={() => setSelectedMapListingId(listing.id)}
                        >
                          <span>{listing.neighborhood}</span>
                          <strong>{listing.address}</strong>
                          <p className="map-mobile-rail__rating">
                            ★ {ratingText}
                            {isFavorite ? "  ·  ❤" : ""}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="map-mobile-list-toggle"
                    onClick={() => setIsMapListOpen((open) => !open)}
                  >
                    {isMapListOpen ? messages.mapListClose : messages.mapListOpen}
                  </button>
                </section>

                <section className="map-selected-details">
                  {selectedMapListing.imageUrls?.[0] ? (
                    <div className="map-selected-details__media">
                      <img
                        src={selectedMapListing.imageUrls[0]}
                        alt={`${selectedMapListing.address} · ${messages.imageAltProperty}`}
                        loading="lazy"
                      />
                    </div>
                  ) : null}
                  <p className="map-selected-details__eyebrow">{selectedMapListing.neighborhood}</p>
                  <h4>{selectedMapListing.address}</h4>
                  <div className="map-selected-details__stats">
                    <p className="stat-chip">
                      <span>{messages.ratingLabel}</span>
                      <strong>
                        {typeof selectedMapListing.averageRating === "number"
                          ? formatDecimal(selectedMapListing.averageRating, lang)
                          : "-"}
                      </strong>
                    </p>
                    <p className="stat-chip">
                      <span>{messages.recommendationRateLabel}</span>
                      <strong>
                        {typeof selectedMapListing.recommendationRate === "number"
                          ? formatPercent(selectedMapListing.recommendationRate, lang)
                          : "-"}
                      </strong>
                    </p>
                    <p className="stat-chip">
                      <span>{messages.priceLabel}</span>
                      <strong>
                        {(() => {
                          const priceText = formatUsdRangePlain(
                            {
                              min: selectedMapListing.minPriceUsd,
                              max: selectedMapListing.maxPriceUsd,
                            },
                            lang,
                          );
                          return priceText || "-";
                        })()}
                      </strong>
                    </p>
                    <p className="stat-chip">
                      <span>{messages.capacityLabel}</span>
                      <strong>
                        {typeof selectedMapListing.capacity === "number"
                          ? `${Math.round(selectedMapListing.capacity)} ${messages.studentsSuffix}`
                          : "-"}
                      </strong>
                    </p>
                  </div>
                  <p className="map-selected-details__contacts-label">{messages.ownerContacts}</p>
                  {canViewOwnerInfo ? (
                    <>
                      {selectedMapListing.contacts.length > 0 ? (
                        <ul className="contact-list map-selected-details__contacts">
                          {selectedMapListing.contacts.map((contact) => (
                            <li key={contact}>{renderContactValue(contact)}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>-</p>
                      )}
                    </>
                  ) : (
                    <p className="contact-lock-hint">{messages.ownerContactsLoginHint}</p>
                  )}
                  {canWriteReviews ? (
                  <ContactEditRequestForm
                    listingId={selectedMapListing.id}
                    currentContacts={selectedMapListing.contacts}
                    currentCapacity={selectedMapListing.capacity}
                    messages={messages}
                    compact
                  />
                  ) : null}
                  <div className="map-selected-details__actions">
                    <button
                      type="button"
                      className={`inline-link map-selected-details__favorite${
                        selectedMapListingIsFavorite ? " is-active" : ""
                      }`}
                      aria-pressed={selectedMapListingIsFavorite}
                      aria-label={getFavoriteAriaLabel(selectedMapListingIsFavorite)}
                      title={getFavoriteAriaLabel(selectedMapListingIsFavorite)}
                      disabled={selectedMapListingFavoritePending}
                      onClick={() => void toggleFavorite(selectedMapListing.id)}
                    >
                      {selectedMapListingIsFavorite ? messages.favoriteRemove : messages.favoriteAdd}
                    </button>
                    <Link href={`/${lang}/place/${selectedMapListing.id}`} className="inline-link">
                      {messages.viewDetails}
                    </Link>
                    {isAdmin ? (
                      <Link
                        href={`/${lang}/admin/publications?listingId=${selectedMapListing.id}`}
                        className="inline-link"
                      >
                        {messages.adminEditListing}
                      </Link>
                    ) : null}
                  </div>
                </section>

                <section className="map-layout__reviews" aria-live="polite">
                  <p className="map-layout__reviews-title">{messages.historicalReviews}</p>
                  {selectedMapReviews.length === 0 ? (
                    <p className="map-layout__reviews-empty">{messages.noComments}</p>
                  ) : (
                    <ul className="map-layout__reviews-list">
                      {selectedMapReviews.map((review) => (
                        <li key={review.id} className="map-layout__review-item">
                          <ReviewComment
                            comment={review.comment || ""}
                            translatedComment={review.translatedComment}
                            originalComment={review.originalComment}
                            showOriginalLabel={messages.reviewShowOriginal}
                            showTranslationLabel={messages.reviewShowTranslation}
                          />
                          {review.studentContact ? (
                            <p className="review-item__contact">
                              {messages.reviewContactLabel}:{" "}
                              {splitReviewerContactParts(review.studentContact).map((part, index) => {
                                if (part.type === "link") {
                                  const isExternal = part.kind === "whatsapp" || part.kind === "url";
                                  return (
                                    <a
                                      key={`${part.text}-${index}`}
                                      href={part.href}
                                      target={isExternal ? "_blank" : undefined}
                                      rel={isExternal ? "noreferrer" : undefined}
                                    >
                                      {part.text}
                                    </a>
                                  );
                                }
                                return <span key={`${part.text}-${index}`}>{part.text}</span>;
                              })}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {canWriteReviews ? (
                  <section className="map-selected-review">
                    <h4>{messages.leaveReviewTitle}</h4>
                    <p>{messages.leaveReviewSubtitle}</p>
                    <ReviewForm
                      key={`map-review-${selectedMapListing.id}`}
                      lang={lang}
                      listingId={selectedMapListing.id}
                    />
                  </section>
                ) : null}
              </>
            ) : null}
          </div>
        </section>
      )}
    </>
  );
}
