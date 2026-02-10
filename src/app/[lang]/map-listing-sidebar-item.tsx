"use client";

import Link from "next/link";

import { formatDecimal, formatUsdRange } from "@/lib/format";
import type { Messages } from "@/i18n/messages";
import type { Lang, Listing } from "@/types";

interface MapListingSidebarItemProps {
  lang: Lang;
  listing: Listing;
  messages: Messages;
  isSelected: boolean;
  registerRef: (element: HTMLElement | null) => void;
  onSelect: () => void;
}

export function MapListingSidebarItem({
  lang,
  listing,
  messages,
  isSelected,
  registerRef,
  onSelect,
}: MapListingSidebarItemProps) {
  const priceText = formatUsdRange(
    {
      min: listing.minPriceUsd,
      max: listing.maxPriceUsd,
    },
    lang,
  );
  const coverImage = listing.imageUrls?.[0];

  return (
    <article
      ref={registerRef}
      className={`map-listing ${isSelected ? "is-selected" : ""}`}
    >
      <button
        type="button"
        className="map-listing__select"
        aria-pressed={isSelected}
        onClick={onSelect}
      >
        <div className="map-listing__media">
          {coverImage ? (
            <img src={coverImage} alt={`${listing.address} cover`} loading="lazy" />
          ) : (
            <div className="map-listing__media-placeholder" aria-hidden="true" />
          )}
          <p className="map-listing__price-pill">
            {priceText ? `${priceText} ${messages.monthSuffix}` : messages.priceLabel}
          </p>
        </div>
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
          <p>{messages.priceLabel}: {priceText ? `${priceText} ${messages.monthSuffix}` : "-"}</p>
        </div>
      </button>
      <Link href={`/${lang}/place/${listing.id}`} className="inline-link">
        {messages.viewDetails}
      </Link>
    </article>
  );
}
