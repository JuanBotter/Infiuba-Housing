"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
}

export function PlaceFilters({ lang, messages, listings, neighborhoods }: PlaceFiltersProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNeighborhood, setSelectedNeighborhood] = useState("all");
  const [recommendedFilter, setRecommendedFilter] = useState("any");
  const [viewMode, setViewMode] = useState<"cards" | "map">("cards");
  const [selectedMapListingId, setSelectedMapListingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return listings.filter((listing) => {
      const searchMatch =
        !searchTerm ||
        listing.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        listing.neighborhood.toLowerCase().includes(searchTerm.toLowerCase());

      const neighborhoodMatch =
        selectedNeighborhood === "all" || listing.neighborhood === selectedNeighborhood;

      const recommendationMatch =
        recommendedFilter === "any" ||
        (recommendedFilter === "yes" && (listing.recommendationRate ?? 0) >= 0.5) ||
        (recommendedFilter === "no" && (listing.recommendationRate ?? 0) < 0.5);

      return searchMatch && neighborhoodMatch && recommendationMatch;
    });
  }, [listings, recommendedFilter, searchTerm, selectedNeighborhood]);

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedMapListingId(null);
      return;
    }

    const selectedStillExists = filtered.some((listing) => listing.id === selectedMapListingId);
    if (!selectedMapListingId || !selectedStillExists) {
      setSelectedMapListingId(filtered[0].id);
    }
  }, [filtered, selectedMapListingId]);

  const selectedMapListing =
    filtered.find((listing) => listing.id === selectedMapListingId) || filtered[0] || null;
  const selectedMapQuery = selectedMapListing
    ? encodeURIComponent(
        `${selectedMapListing.address}, ${selectedMapListing.neighborhood}, Buenos Aires, Argentina`,
      )
    : "";

  return (
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
      </section>

      <p className="result-count">
        {filtered.length} {messages.resultsLabel}
      </p>

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
      </section>

      {filtered.length === 0 ? (
        <p className="empty-state">{messages.noResults}</p>
      ) : viewMode === "cards" ? (
        <section className="cards-grid">
          {filtered.map((listing) => (
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
            {filtered.map((listing) => {
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
                  listings={filtered}
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
