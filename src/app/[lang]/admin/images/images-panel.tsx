"use client";

import { useEffect, useMemo, useState } from "react";

import type { AdminListingImageSummary } from "@/lib/admin-listing-images";
import type { Messages } from "@/i18n/messages";

interface ListingImageDetail {
  id: string;
  address: string;
  neighborhood: string;
  orderedImages: string[];
}

interface ImagesPanelProps {
  messages: Messages;
  initialListings: AdminListingImageSummary[];
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (
    fromIndex < 0 ||
    fromIndex >= items.length ||
    toIndex < 0 ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function ImagesPanel({ messages, initialListings }: ImagesPanelProps) {
  const [listings, setListings] = useState(initialListings);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedListingId, setSelectedListingId] = useState(initialListings[0]?.id || "");
  const [detail, setDetail] = useState<ListingImageDetail | null>(null);
  const [orderedImages, setOrderedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [error, setError] = useState("");

  const filteredListings = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return listings;
    }

    return listings.filter((listing) =>
      `${listing.address} ${listing.neighborhood}`.toLowerCase().includes(normalizedQuery),
    );
  }, [listings, searchQuery]);

  useEffect(() => {
    if (!selectedListingId && filteredListings[0]?.id) {
      setSelectedListingId(filteredListings[0].id);
      return;
    }

    if (!selectedListingId) {
      return;
    }

    const stillVisible = filteredListings.some((listing) => listing.id === selectedListingId);
    if (!stillVisible) {
      setSelectedListingId(filteredListings[0]?.id || "");
    }
  }, [filteredListings, selectedListingId]);

  async function refreshListings() {
    setError("");
    try {
      const response = await fetch("/api/admin/listing-images");
      if (!response.ok) {
        setError(messages.adminImagesLoadError);
        return;
      }

      const payload = (await response.json()) as { listings?: AdminListingImageSummary[] };
      setListings(payload.listings || []);
    } catch {
      setError(messages.adminImagesLoadError);
    }
  }

  useEffect(() => {
    if (!selectedListingId) {
      setDetail(null);
      setOrderedImages([]);
      setStatus("idle");
      setError("");
      return;
    }

    let isCancelled = false;

    async function loadListingDetail() {
      setLoading(true);
      setStatus("idle");
      setError("");
      try {
        const response = await fetch(
          `/api/admin/listing-images?listingId=${encodeURIComponent(selectedListingId)}`,
        );
        if (!response.ok) {
          if (!isCancelled) {
            setDetail(null);
            setOrderedImages([]);
            setError(messages.adminImagesLoadError);
          }
          return;
        }

        const payload = (await response.json()) as ListingImageDetail;
        if (isCancelled) {
          return;
        }

        setDetail(payload);
        setOrderedImages(payload.orderedImages || []);
      } catch {
        if (!isCancelled) {
          setDetail(null);
          setOrderedImages([]);
          setError(messages.adminImagesLoadError);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    void loadListingDetail();
    return () => {
      isCancelled = true;
    };
  }, [messages.adminImagesLoadError, selectedListingId]);

  async function saveOrder() {
    if (!detail) {
      return;
    }

    setSaving(true);
    setStatus("idle");
    setError("");

    try {
      const response = await fetch("/api/admin/listing-images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          listingId: detail.id,
          orderedImageUrls: orderedImages,
        }),
      });

      if (!response.ok) {
        setStatus("error");
        setError(messages.adminImagesSaveError);
        return;
      }

      setStatus("success");
      await refreshListings();
    } catch {
      setStatus("error");
      setError(messages.adminImagesSaveError);
    } finally {
      setSaving(false);
    }
  }

  function moveUp(index: number) {
    setOrderedImages((current) => moveItem(current, index, index - 1));
    setStatus("idle");
    setError("");
  }

  function moveDown(index: number) {
    setOrderedImages((current) => moveItem(current, index, index + 1));
    setStatus("idle");
    setError("");
  }

  function moveToTop(index: number) {
    setOrderedImages((current) => moveItem(current, index, 0));
    setStatus("idle");
    setError("");
  }

  return (
    <>
      <article className="detail-card moderation-toolbar moderation-toolbar--admin">
        <h2>{messages.adminImagesTitle}</h2>
        <p className="property-form__hint">{messages.adminImagesSubtitle}</p>
        <div className="property-form">
          <label className="property-form__full">
            <span>{messages.adminImagesSearchLabel}</span>
            <input
              type="text"
              value={searchQuery}
              placeholder={messages.adminImagesSearchPlaceholder}
              onChange={(event) => setSearchQuery(event.target.value)}
              maxLength={120}
            />
          </label>
          <label className="property-form__full">
            <span>{messages.adminImagesListingLabel}</span>
            <select
              value={selectedListingId}
              onChange={(event) => {
                setSelectedListingId(event.target.value);
                setStatus("idle");
                setError("");
              }}
            >
              {filteredListings.length === 0 ? (
                <option value="">{messages.adminImagesNoListings}</option>
              ) : null}
              {filteredListings.map((listing) => (
                <option key={listing.id} value={listing.id}>
                  {listing.address} · {listing.neighborhood} ({listing.imageCount})
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="button-link" onClick={() => void refreshListings()}>
            {messages.adminRefresh}
          </button>
        </div>
      </article>

      <article className="detail-card">
        {loading ? <p>{messages.adminLoading}</p> : null}
        {!loading && detail ? (
          <>
            <p className="detail-card__eyebrow">{detail.neighborhood}</p>
            <h3>{detail.address}</h3>
            {orderedImages.length === 0 ? <p>{messages.adminImagesNoImages}</p> : null}
            {orderedImages.length > 0 ? (
              <ul className="review-list">
                {orderedImages.map((imageUrl, index) => (
                  <li key={`${imageUrl}-${index}`} className="review-item moderation-item">
                    <img
                      src={imageUrl}
                      alt={`${messages.imageAltProperty} ${index + 1}`}
                      loading="lazy"
                    />
                    <p className="review-item__meta">
                      {index === 0 ? messages.adminImagesCoverLabel : `${index + 1}.`}
                    </p>
                    <div className="moderation-actions">
                      <button
                        type="button"
                        className="button-link"
                        onClick={() => moveToTop(index)}
                        disabled={index === 0}
                      >
                        {messages.adminImagesSetCover}
                      </button>
                      <button
                        type="button"
                        className="button-link"
                        onClick={() => moveUp(index)}
                        disabled={index === 0}
                      >
                        {messages.adminImagesMoveUp}
                      </button>
                      <button
                        type="button"
                        className="button-link"
                        onClick={() => moveDown(index)}
                        disabled={index >= orderedImages.length - 1}
                      >
                        {messages.adminImagesMoveDown}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            {orderedImages.length > 0 ? (
              <button type="button" className="button-link" onClick={() => void saveOrder()} disabled={saving}>
                {saving ? messages.adminImagesSaving : messages.adminImagesSave}
              </button>
            ) : null}
          </>
        ) : null}
        {status === "success" ? (
          <p className="form-status success">{messages.adminImagesSaveSuccess}</p>
        ) : null}
        {error ? <p className="form-status error">{error}</p> : null}
      </article>
    </>
  );
}
