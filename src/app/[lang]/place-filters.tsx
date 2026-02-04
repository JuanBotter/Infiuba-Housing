"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AddStayReviewForm } from "@/app/[lang]/add-stay-review-form";
import { formatDecimal, formatPercent, formatUsd } from "@/lib/format";
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

export function PlaceFilters({
  lang,
  messages,
  listings,
  neighborhoods,
  canWriteReviews,
}: PlaceFiltersProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNeighborhood, setSelectedNeighborhood] = useState("all");
  const [recommendedFilter, setRecommendedFilter] = useState("any");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [minRating, setMinRating] = useState("any");
  const [sortBy, setSortBy] = useState("default");
  const [viewMode, setViewMode] = useState<"cards" | "map" | "review">("cards");
  const [selectedMapListingId, setSelectedMapListingId] = useState<string | null>(null);

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
    const chips: string[] = [];

    if (searchTerm.trim()) {
      chips.push(`${messages.searchLabel}: ${searchTerm.trim()}`);
    }

    if (selectedNeighborhood !== "all") {
      chips.push(`${messages.neighborhoodLabel}: ${selectedNeighborhood}`);
    }

    if (recommendedFilter === "yes") {
      chips.push(`${messages.recommendationLabel}: ${messages.recommendationYes}`);
    } else if (recommendedFilter === "no") {
      chips.push(`${messages.recommendationLabel}: ${messages.recommendationNo}`);
    }

    if (priceMin !== "" && Number.isFinite(Number(priceMin))) {
      chips.push(`${messages.filterPriceMinLabel}: ${formatUsd(Number(priceMin), lang)}`);
    }

    if (priceMax !== "" && Number.isFinite(Number(priceMax))) {
      chips.push(`${messages.filterPriceMaxLabel}: ${formatUsd(Number(priceMax), lang)}`);
    }

    if (minRating !== "any" && Number.isFinite(Number(minRating))) {
      chips.push(`${messages.filterMinRatingLabel}: ${minRating}+`);
    }

    if (sortBy !== "default") {
      const sortLabelMap: Record<string, string> = {
        rating_desc: messages.sortRatingDesc,
        price_asc: messages.sortPriceAsc,
        reviews_desc: messages.sortReviewsDesc,
        recent_desc: messages.sortRecentDesc,
      };
      chips.push(`${messages.sortLabel}: ${sortLabelMap[sortBy] || messages.sortDefault}`);
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
    messages.sortDefault,
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

  function clearFilters() {
    setSearchTerm("");
    setSelectedNeighborhood("all");
    setRecommendedFilter("any");
    setPriceMin("");
    setPriceMax("");
    setMinRating("any");
    setSortBy("default");
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
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="default">{messages.sortDefault}</option>
                <option value="rating_desc">{messages.sortRatingDesc}</option>
                <option value="price_asc">{messages.sortPriceAsc}</option>
                <option value="reviews_desc">{messages.sortReviewsDesc}</option>
                <option value="recent_desc">{messages.sortRecentDesc}</option>
              </select>
            </label>
          </section>

          {activeFilters.length > 0 ? (
            <section className="active-filters">
              <p className="active-filters__label">{messages.activeFiltersLabel}</p>
              <div className="active-filters__list">
                {activeFilters.map((chip) => (
                  <span key={chip} className="active-filters__chip">
                    {chip}
                  </span>
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
                      {typeof listing.priceUsd === "number"
                        ? `${formatUsd(listing.priceUsd, lang)} ${messages.monthSuffix}`
                        : "-"}
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
                      {typeof listing.priceUsd === "number"
                        ? `${formatUsd(listing.priceUsd, lang)} ${messages.monthSuffix}`
                        : "-"}
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
