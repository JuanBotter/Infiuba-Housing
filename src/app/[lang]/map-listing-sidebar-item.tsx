"use client";

import Link from "next/link";

import { formatDecimal, formatUsdRangePlain } from "@/lib/format";
import type { Messages } from "@/i18n/messages";
import type { Lang, Listing } from "@/types";

interface MapListingSidebarItemProps {
  lang: Lang;
  listing: Listing;
  messages: Messages;
  isSelected: boolean;
  isFavorite: boolean;
  isFavoritePending: boolean;
  favoriteAriaLabel: string;
  registerRef: (element: HTMLElement | null) => void;
  onSelect: () => void;
  onToggleFavorite: () => void;
  adminEditHref?: string;
  adminEditLabel?: string;
}

export function MapListingSidebarItem({
  lang,
  listing,
  messages,
  isSelected,
  isFavorite,
  isFavoritePending,
  favoriteAriaLabel,
  registerRef,
  onSelect,
  onToggleFavorite,
  adminEditHref,
  adminEditLabel,
}: MapListingSidebarItemProps) {
  const priceText = formatUsdRangePlain(
    {
      min: listing.minPriceUsd,
      max: listing.maxPriceUsd,
    },
    lang,
  );
  const ratingText =
    typeof listing.averageRating === "number"
      ? formatDecimal(listing.averageRating, lang)
      : "-";
  const coverImage = listing.imageUrls?.[0];

  return (
    <article
      ref={registerRef}
      className={`map-listing ${isSelected ? "is-selected" : ""}`}
    >
      <div className="map-listing__select-wrap">
        <button
          type="button"
          className="map-listing__select"
          aria-pressed={isSelected}
          onClick={onSelect}
        >
          <div className="map-listing__media">
            {coverImage ? (
              <img src={coverImage} alt={`${listing.address} · ${messages.imageAltProperty}`} loading="lazy" />
            ) : (
              <div className="map-listing__media-placeholder" aria-hidden="true" />
            )}
            <div className="map-listing__media-overlay" aria-hidden="true">
              <div className="map-listing__overlay-pills">
                <p className="map-listing__pill">{listing.neighborhood}</p>
                <p className="map-listing__pill">
                  {priceText || "-"}
                </p>
                <p className="map-listing__pill">★ {ratingText}</p>
              </div>
            </div>
          </div>
          <div className="map-listing__head">
            <p className="place-card__neighborhood">{listing.neighborhood}</p>
            <p className="place-card__reviews-badge">
              {listing.totalReviews} {messages.reviewsLabel}
            </p>
          </div>
          <h3>{listing.address}</h3>
          <div className="map-listing__stats">
            <p>{messages.ratingLabel}: {ratingText}</p>
            <p>{messages.priceLabel}: {priceText || "-"}</p>
          </div>
        </button>
        <button
          type="button"
          className={`map-listing__favorite-button${isFavorite ? " is-active" : ""}`}
          aria-pressed={isFavorite}
          aria-label={favoriteAriaLabel}
          title={favoriteAriaLabel}
          disabled={isFavoritePending}
          onClick={() => void onToggleFavorite()}
        >
          <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
            <path d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.5L12 21.35Z" />
          </svg>
        </button>
      </div>
      <Link href={`/${lang}/place/${listing.id}`} className="inline-link">
        {messages.viewDetails}
      </Link>
      {adminEditHref && adminEditLabel ? (
        <Link href={adminEditHref} className="inline-link">
          {adminEditLabel}
        </Link>
      ) : null}
    </article>
  );
}
