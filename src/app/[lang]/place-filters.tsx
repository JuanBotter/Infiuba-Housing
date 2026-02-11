"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";

import { AddStayReviewForm } from "@/app/[lang]/add-stay-review-form";
import { MapListingSidebarItem } from "@/app/[lang]/map-listing-sidebar-item";
import {
  getListingMinReviewPrice,
  hasReviewPriceInRange,
} from "@/app/[lang]/place-filters-price";
import { useFavorites } from "@/app/[lang]/use-favorites";
import {
  normalizeSortBy,
  type SortBy,
  usePlaceFiltersState,
} from "@/app/[lang]/use-place-filters-state";
import { usePriceFilter } from "@/app/[lang]/use-price-filter";
import { ReviewComment } from "@/app/[lang]/place/[id]/review-comment";
import { ReviewForm } from "@/app/[lang]/place/[id]/review-form";
import { ContactRichText } from "@/components/contact-rich-text";
import { ContactEditRequestForm } from "@/components/contact-edit-request-form";
import {
  formatDecimal,
  formatPercent,
  formatUsd,
  formatUsdAmount,
  formatUsdRangePlain,
} from "@/lib/format";
import { splitReviewerContactParts } from "@/lib/reviewer-contact";
import { getReviewDisplayYear } from "@/lib/review-year";
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
  const mapListItemRefs = useRef<Record<string, HTMLElement | null>>({});
  const mapRailItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const {
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
  } = usePlaceFiltersState(canWriteReviews, isLoggedIn);
  const {
    favoriteListingIdSet,
    favoritePendingListingIdSet,
    favoriteActionError,
    getFavoriteAriaLabel,
    toggleFavorite,
  } = useFavorites(isLoggedIn, {
    accessUnknownError: messages.accessUnknownError,
    accessLoginUnavailableError: messages.accessLoginUnavailableError,
    favoriteLoginHint: messages.favoriteLoginHint,
    favoriteAdd: messages.favoriteAdd,
    favoriteRemove: messages.favoriteRemove,
  });
  const {
    priceBounds,
    priceSliderStep,
    effectivePriceRange,
    priceRangeTrackStyle,
    priceHistogram,
    startPriceSliderDrag,
    endPriceSliderDrag,
    handleMinPriceSliderChange,
    handleMaxPriceSliderChange,
  } = usePriceFilter({
    listings,
    priceMin,
    setPriceMin,
    priceMax,
    setPriceMax,
  });
  const previousSortByRef = useRef<SortBy>(sortBy);

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
        <AddStayReviewForm
          lang={lang}
          messages={messages}
          listings={listings}
          neighborhoods={neighborhoods}
        />
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
                  messages={{ reviewsLabel: messages.reviewsLabel }}
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
                            <li key={contact}>
                              <ContactRichText contact={contact} />
                            </li>
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
                      {selectedMapReviews.map((review) => {
                        const displayYear = getReviewDisplayYear(review);
                        return (
                          <li key={review.id} className="map-layout__review-item">
                            <p className="review-item__meta">
                              {review.source === "web"
                                ? messages.reviewSourceWeb
                                : messages.reviewSourceSurvey}
                              {typeof displayYear === "number" ? ` · ${displayYear}` : ""}
                              {typeof review.priceUsd === "number"
                                ? ` · ${formatUsd(review.priceUsd, lang)} ${messages.monthSuffix}`
                                : ""}
                              {review.semester ? ` · ${review.semester}` : ""}
                            </p>
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
                        );
                      })}
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
                      messages={messages}
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
