"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { AddStayReviewForm } from "@/app/[lang]/add-stay-review-form";
import { MapListingSidebarItem } from "@/app/[lang]/map-listing-sidebar-item";
import {
  getListingMinReviewPrice,
  hasReviewPriceInRange,
} from "@/app/[lang]/place-filters-price";
import { ReviewComment } from "@/app/[lang]/place/[id]/review-comment";
import { ReviewForm } from "@/app/[lang]/place/[id]/review-form";
import { splitContactParts } from "@/lib/contact-links";
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
  canViewOwnerInfo: boolean;
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
const FILTER_STORAGE_KEY = "infiuba:filters:v2";
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
  const [sortBy, setSortBy] = useState<SortBy>("recent_desc");
  const [viewMode, setViewMode] = useState<"cards" | "map" | "review">("map");
  const [selectedMapListingId, setSelectedMapListingId] = useState<string | null>(null);
  const [isMapListOpen, setIsMapListOpen] = useState(false);
  const previousSortByRef = useRef<SortBy>(sortBy);

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
      minRating,
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
    sortBy,
    viewMode,
    hasLoadedPersistedFilters,
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

      const priceRangeMatch =
        !hasMinPrice && !hasMaxPrice
          ? true
          : hasReviewPriceInRange(
              listing,
              hasMinPrice ? minPriceValue : undefined,
              hasMaxPrice ? maxPriceValue : undefined,
            );

      const minRatingMatch =
        !hasMinRating ||
        (typeof listing.averageRating === "number" && listing.averageRating >= minRatingValue);

      return (
        searchMatch &&
        neighborhoodMatch &&
        recommendationMatch &&
        priceRangeMatch &&
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
              return (
                <MapListingSidebarItem
                  key={listing.id}
                  lang={lang}
                  listing={listing}
                  messages={messages}
                  isSelected={isSelected}
                  registerRef={(element) => {
                    mapListItemRefs.current[listing.id] = element;
                  }}
                  onSelect={() => {
                    setSelectedMapListingId(listing.id);
                    setIsMapListOpen(false);
                  }}
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
                          const priceText = formatUsdRange(
                            {
                              min: selectedMapListing.minPriceUsd,
                              max: selectedMapListing.maxPriceUsd,
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
                  <Link href={`/${lang}/place/${selectedMapListing.id}`} className="inline-link">
                    {messages.viewDetails}
                  </Link>
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
