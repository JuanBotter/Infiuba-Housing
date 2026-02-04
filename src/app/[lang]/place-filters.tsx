"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { AddStayReviewForm } from "@/app/[lang]/add-stay-review-form";
import { formatDecimal, formatPercent, formatUsd, formatUsdRange } from "@/lib/format";
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
  canWriteReviews: boolean;
}

interface PersistedFilters {
  searchTerm?: string;
  selectedNeighborhood?: string;
  recommendedFilter?: string;
  priceMin?: string;
  priceMax?: string;
  minRating?: string;
  sortBy?: string;
  viewMode?: "cards" | "map" | "review";
}

type SortBy = "rating_desc" | "price_asc" | "reviews_desc" | "recent_desc";
type ActiveFilterId =
  | "search"
  | "neighborhood"
  | "recommended"
  | "priceMin"
  | "priceMax"
  | "minRating"
  | "sort";

interface ActiveFilterChip {
  id: ActiveFilterId;
  label: string;
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

export function PlaceFilters({
  lang,
  messages,
  listings,
  neighborhoods,
  canWriteReviews,
}: PlaceFiltersProps) {
  const storageKey = `infiuba:filters:${lang}`;
  const didLoadPersistedFilters = useRef(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNeighborhood, setSelectedNeighborhood] = useState("all");
  const [recommendedFilter, setRecommendedFilter] = useState("any");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [minRating, setMinRating] = useState("any");
  const [sortBy, setSortBy] = useState<SortBy>("recent_desc");
  const [viewMode, setViewMode] = useState<"cards" | "map" | "review">("cards");
  const [selectedMapListingId, setSelectedMapListingId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        didLoadPersistedFilters.current = true;
        return;
      }

      const persisted = JSON.parse(raw) as PersistedFilters;
      if (typeof persisted.searchTerm === "string") {
        setSearchTerm(persisted.searchTerm);
      }
      if (typeof persisted.selectedNeighborhood === "string") {
        setSelectedNeighborhood(persisted.selectedNeighborhood);
      }
      if (typeof persisted.recommendedFilter === "string") {
        setRecommendedFilter(persisted.recommendedFilter);
      }
      if (typeof persisted.priceMin === "string") {
        setPriceMin(persisted.priceMin);
      }
      if (typeof persisted.priceMax === "string") {
        setPriceMax(persisted.priceMax);
      }
      if (typeof persisted.minRating === "string") {
        setMinRating(persisted.minRating);
      }
      if (typeof persisted.sortBy === "string") {
        setSortBy(normalizeSortBy(persisted.sortBy));
      }
      if (persisted.viewMode === "cards" || persisted.viewMode === "map") {
        setViewMode(persisted.viewMode);
      } else if (persisted.viewMode === "review") {
        setViewMode(canWriteReviews ? "review" : "cards");
      }
    } catch {
      // Ignore invalid persisted values.
    } finally {
      didLoadPersistedFilters.current = true;
    }
  }, [canWriteReviews, storageKey]);

  useEffect(() => {
    if (!didLoadPersistedFilters.current) {
      return;
    }

    const payload: PersistedFilters = {
      searchTerm,
      selectedNeighborhood,
      recommendedFilter,
      priceMin,
      priceMax,
      minRating,
      sortBy,
      viewMode,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [
    minRating,
    priceMax,
    priceMin,
    recommendedFilter,
    searchTerm,
    selectedNeighborhood,
    sortBy,
    storageKey,
    viewMode,
  ]);

  const filtered = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const minPriceValue = Number(priceMin);
    const maxPriceValue = Number(priceMax);
    const minRatingValue = Number(minRating);
    const hasMinPrice = priceMin !== "" && Number.isFinite(minPriceValue);
    const hasMaxPrice = priceMax !== "" && Number.isFinite(maxPriceValue);
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

      const minPriceMatch =
        !hasMinPrice || (typeof listing.priceUsd === "number" && listing.priceUsd >= minPriceValue);

      const maxPriceMatch =
        !hasMaxPrice || (typeof listing.priceUsd === "number" && listing.priceUsd <= maxPriceValue);

      const minRatingMatch =
        !hasMinRating ||
        (typeof listing.averageRating === "number" && listing.averageRating >= minRatingValue);

      return (
        searchMatch &&
        neighborhoodMatch &&
        recommendationMatch &&
        minPriceMatch &&
        maxPriceMatch &&
        minRatingMatch
      );
    });
  }, [listings, minRating, priceMax, priceMin, recommendedFilter, searchTerm, selectedNeighborhood]);

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
        const priceOrder = numberCompare(left.priceUsd, right.priceUsd, "asc");
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
      return;
    }

    const selectedStillExists = filteredAndSorted.some(
      (listing) => listing.id === selectedMapListingId,
    );
    if (!selectedMapListingId || !selectedStillExists) {
      setSelectedMapListingId(filteredAndSorted[0].id);
    }
  }, [filteredAndSorted, selectedMapListingId]);

  const selectedMapListing =
    filteredAndSorted.find((listing) => listing.id === selectedMapListingId) ||
    filteredAndSorted[0] ||
    null;
  const selectedMapQuery = selectedMapListing
    ? encodeURIComponent(
        `${selectedMapListing.address}, ${selectedMapListing.neighborhood}, Buenos Aires, Argentina`,
      )
    : "";
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

    if (priceMin !== "" && Number.isFinite(Number(priceMin))) {
      chips.push({
        id: "priceMin",
        label: `${messages.filterPriceMinLabel}: ${formatUsd(Number(priceMin), lang)}`,
      });
    }

    if (priceMax !== "" && Number.isFinite(Number(priceMax))) {
      chips.push({
        id: "priceMax",
        label: `${messages.filterPriceMaxLabel}: ${formatUsd(Number(priceMax), lang)}`,
      });
    }

    if (minRating !== "any" && Number.isFinite(Number(minRating))) {
      chips.push({ id: "minRating", label: `${messages.filterMinRatingLabel}: ${minRating}+` });
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
    lang,
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
    minRating,
    priceMax,
    priceMin,
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
    setSortBy("recent_desc");
  }

  function clearFilters() {
    setSearchTerm("");
    setSelectedNeighborhood("all");
    setRecommendedFilter("any");
    setPriceMin("");
    setPriceMax("");
    setMinRating("any");
    setSortBy("recent_desc");
  }

  return (
    <>
      <section className="view-toggle" aria-label={messages.viewModeLabel}>
        <button
          type="button"
          className={`view-toggle__button ${viewMode === "cards" ? "is-active" : ""}`}
          onClick={() => setViewMode("cards")}
        >
          {messages.viewCards}
        </button>
        <button
          type="button"
          className={`view-toggle__button ${viewMode === "map" ? "is-active" : ""}`}
          onClick={() => setViewMode("map")}
        >
          {messages.viewMap}
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

            <label>
              <span>{messages.filterPriceMinLabel}</span>
              <input
                type="number"
                min={0}
                step="1"
                value={priceMin}
                onChange={(event) => setPriceMin(event.target.value)}
                placeholder="0"
              />
            </label>

            <label>
              <span>{messages.filterPriceMaxLabel}</span>
              <input
                type="number"
                min={0}
                step="1"
                value={priceMax}
                onChange={(event) => setPriceMax(event.target.value)}
                placeholder="2000"
              />
            </label>

            <label>
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

            <label>
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
          </section>

          {activeFilters.length > 0 ? (
            <section className="active-filters">
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
              <button type="button" className="active-filters__clear" onClick={clearFilters}>
                {messages.clearFilters}
              </button>
            </section>
          ) : null}

          <p className="result-count">
            {filteredAndSorted.length} {messages.resultsLabel}
          </p>
        </>
      ) : null}

      {isReviewMode ? (
        <AddStayReviewForm lang={lang} listings={listings} />
      ) : filteredAndSorted.length === 0 ? (
        <p className="empty-state">{messages.noResults}</p>
      ) : viewMode === "cards" ? (
        <section className="cards-grid">
          {filteredAndSorted.map((listing) => (
            <Link
              key={listing.id}
              href={`/${lang}/place/${listing.id}`}
              className="place-card-link"
              aria-label={`${listing.address}, ${listing.neighborhood}`}
            >
              <article className="place-card">
                <div className="place-card__head">
                  <div className="place-card__meta">
                    <p className="place-card__neighborhood">{listing.neighborhood}</p>
                    <p className="place-card__reviews-badge">
                      {listing.totalReviews} {messages.reviewsLabel}
                    </p>
                  </div>
                  <h2>{listing.address}</h2>
                </div>

                <div className="place-card__stats">
                  <p className="stat-chip">
                    <span>{messages.ratingLabel}</span>
                    <strong>
                      {typeof listing.averageRating === "number"
                        ? formatDecimal(listing.averageRating, lang)
                        : "-"}
                    </strong>
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
                    <strong>
                      {(() => {
                        const priceText = formatUsdRange(
                          {
                            min: listing.minPriceUsd,
                            max: listing.maxPriceUsd,
                            fallback: listing.priceUsd,
                          },
                          lang,
                        );
                        return priceText ? `${priceText} ${messages.monthSuffix}` : "-";
                      })()}
                    </strong>
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
            </Link>
          ))}
        </section>
      ) : (
        <section className="map-layout">
          <aside className="map-layout__list">
            {filteredAndSorted.map((listing) => {
              const isSelected = selectedMapListing?.id === listing.id;
              return (
                <article
                  key={listing.id}
                  className={`map-listing ${isSelected ? "is-selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedMapListingId(listing.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedMapListingId(listing.id);
                    }
                  }}
                >
                  <div className="map-listing__head">
                    <p className="place-card__neighborhood">{listing.neighborhood}</p>
                    <p className="place-card__reviews-badge">
                      {listing.totalReviews} {messages.reviewsLabel}
                    </p>
                  </div>
                  <h3>{listing.address}</h3>
                  <div className="map-listing__stats">
                    <p>
                      {messages.ratingLabel}:{" "}
                      {typeof listing.averageRating === "number"
                        ? formatDecimal(listing.averageRating, lang)
                        : "-"}
                    </p>
                    <p>
                      {messages.priceLabel}:{" "}
                      {(() => {
                        const priceText = formatUsdRange(
                          {
                            min: listing.minPriceUsd,
                            max: listing.maxPriceUsd,
                            fallback: listing.priceUsd,
                          },
                          lang,
                        );
                        return priceText ? `${priceText} ${messages.monthSuffix}` : "-";
                      })()}
                    </p>
                  </div>
                  <Link href={`/${lang}/place/${listing.id}`} className="inline-link">
                    {messages.viewDetails}
                  </Link>
                </article>
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
              </>
            ) : null}
          </div>
        </section>
      )}
    </>
  );
}
