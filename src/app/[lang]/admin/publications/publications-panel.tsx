"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { apiGetJson, apiPostJson, mapApiClientErrorMessage } from "@/lib/api-client";
import type { AdminListingImageSummary } from "@/lib/admin-listing-images";
import type { Messages } from "@/i18n/messages";
import type { Lang } from "@/types";

interface ListingPublicationDetail {
  id: string;
  address: string;
  neighborhood: string;
  capacity?: number;
  contacts: string[];
  orderedImages: string[];
}

interface PublicationsPanelProps {
  lang: Lang;
  messages: Messages;
  initialListings: AdminListingImageSummary[];
  initialListingId?: string;
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

function parseContactsInput(value: string) {
  return value
    .split(/[\n,;]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function PublicationsPanel({
  lang,
  messages,
  initialListings,
  initialListingId,
}: PublicationsPanelProps) {
  const [listings, setListings] = useState(initialListings);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedListingId, setSelectedListingId] = useState(() => {
    const normalizedInitial = initialListingId?.trim();
    if (normalizedInitial && initialListings.some((listing) => listing.id === normalizedInitial)) {
      return normalizedInitial;
    }
    return initialListings[0]?.id || "";
  });
  const [detail, setDetail] = useState<ListingPublicationDetail | null>(null);
  const [address, setAddress] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [capacity, setCapacity] = useState("");
  const [contactsInput, setContactsInput] = useState("");
  const [orderedImages, setOrderedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingImages, setSavingImages] = useState(false);
  const [deletingImageUrl, setDeletingImageUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");

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

  function clearStatus() {
    setStatus("idle");
    setStatusMessage("");
  }

  function mapPublicationError(error: unknown, fallbackMessage: string) {
    return mapApiClientErrorMessage(error, {
      defaultMessage: fallbackMessage,
      statusMessages: {
        401: messages.adminAuthError,
      },
    });
  }

  async function refreshListings() {
    clearStatus();
    try {
      const payload = await apiGetJson<{ listings?: AdminListingImageSummary[] }>(
        "/api/admin/publications",
      );
      setListings(payload.listings || []);
    } catch (error) {
      setStatus("error");
      setStatusMessage(mapPublicationError(error, messages.adminImagesLoadError));
    }
  }

  useEffect(() => {
    if (!selectedListingId) {
      setDetail(null);
      setAddress("");
      setNeighborhood("");
      setCapacity("");
      setContactsInput("");
      setOrderedImages([]);
      clearStatus();
      return;
    }

    let isCancelled = false;

    async function loadListingDetail() {
      setLoading(true);
      clearStatus();
      try {
        const payload = await apiGetJson<ListingPublicationDetail>(
          `/api/admin/publications?listingId=${encodeURIComponent(selectedListingId)}`,
        );
        if (isCancelled) {
          return;
        }

        setDetail(payload);
        setAddress(payload.address);
        setNeighborhood(payload.neighborhood);
        setCapacity(
          typeof payload.capacity === "number" && Number.isFinite(payload.capacity)
            ? String(payload.capacity)
            : "",
        );
        setContactsInput(payload.contacts.join("\n"));
        setOrderedImages(payload.orderedImages || []);
      } catch (error) {
        if (!isCancelled) {
          setDetail(null);
          setOrderedImages([]);
          setStatus("error");
          setStatusMessage(mapPublicationError(error, messages.adminImagesLoadError));
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

  async function saveDetails() {
    if (!detail) {
      return;
    }

    setSavingDetails(true);
    clearStatus();

    try {
      const contacts = parseContactsInput(contactsInput);
      await apiPostJson<{ ok: boolean }>("/api/admin/publications", {
          action: "updatePublication",
          listingId: detail.id,
          address,
          neighborhood,
          capacity: capacity.trim() ? Number(capacity) : null,
          contacts,
      });

      await refreshListings();
      setStatus("success");
      setStatusMessage(messages.adminImagesSaveSuccess);
    } catch (error) {
      setStatus("error");
      setStatusMessage(mapPublicationError(error, messages.adminImagesSaveError));
    } finally {
      setSavingDetails(false);
    }
  }

  async function saveOrder() {
    if (!detail) {
      return;
    }

    setSavingImages(true);
    clearStatus();

    try {
      await apiPostJson<{ ok: boolean }>("/api/admin/publications", {
          action: "saveImageOrder",
          listingId: detail.id,
          orderedImageUrls: orderedImages,
      });

      await refreshListings();
      setStatus("success");
      setStatusMessage(messages.adminImagesSaveSuccess);
    } catch (error) {
      setStatus("error");
      setStatusMessage(mapPublicationError(error, messages.adminImagesSaveError));
    } finally {
      setSavingImages(false);
    }
  }

  async function deleteImage(imageUrl: string) {
    if (!detail || !imageUrl) {
      return;
    }

    setDeletingImageUrl(imageUrl);
    clearStatus();
    try {
      const payload = await apiPostJson<{ orderedImages?: string[] }>(
        "/api/admin/publications",
        {
          action: "deleteImage",
          listingId: detail.id,
          imageUrl,
        },
      );
      if (Array.isArray(payload.orderedImages)) {
        setOrderedImages(payload.orderedImages);
      } else {
        setOrderedImages((current) => current.filter((value) => value !== imageUrl));
      }
      await refreshListings();
      setStatus("success");
      setStatusMessage(messages.adminImagesSaveSuccess);
    } catch (error) {
      setStatus("error");
      setStatusMessage(mapPublicationError(error, messages.adminImagesSaveError));
    } finally {
      setDeletingImageUrl("");
    }
  }

  function moveUp(index: number) {
    setOrderedImages((current) => moveItem(current, index, index - 1));
    clearStatus();
  }

  function moveDown(index: number) {
    setOrderedImages((current) => moveItem(current, index, index + 1));
    clearStatus();
  }

  function moveToTop(index: number) {
    setOrderedImages((current) => moveItem(current, index, 0));
    clearStatus();
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
                clearStatus();
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
          <div className="property-form">
            <label className="property-form__full">
              <span>{messages.addPropertyAddressLabel}</span>
              <input
                type="text"
                value={address}
                maxLength={180}
                onChange={(event) => {
                  setAddress(event.target.value);
                  clearStatus();
                }}
              />
            </label>

            <label>
              <span>{messages.neighborhoodLabel}</span>
              <input
                type="text"
                value={neighborhood}
                maxLength={80}
                onChange={(event) => {
                  setNeighborhood(event.target.value);
                  clearStatus();
                }}
              />
            </label>

            <label>
              <span>{messages.capacityLabel}</span>
              <input
                type="number"
                min={1}
                max={50}
                step={1}
                value={capacity}
                onChange={(event) => {
                  setCapacity(event.target.value);
                  clearStatus();
                }}
              />
            </label>

            <label className="property-form__full">
              <span>{messages.addPropertyContactsLabel}</span>
              <textarea
                rows={4}
                value={contactsInput}
                placeholder={messages.addPropertyContactsPlaceholder}
                onChange={(event) => {
                  setContactsInput(event.target.value);
                  clearStatus();
                }}
              />
            </label>

            <div className="property-form__full moderation-actions">
              <button
                type="button"
                className="button-link"
                disabled={savingDetails}
                onClick={() => void saveDetails()}
              >
                {savingDetails ? messages.adminImagesSaving : messages.adminImagesSave}
              </button>
              <Link href={`/${lang}/place/${detail.id}`} className="inline-link">
                {messages.viewDetails}
              </Link>
            </div>
          </div>
        ) : null}
      </article>

      <article className="detail-card">
        {loading ? <p>{messages.adminLoading}</p> : null}
        {!loading && detail ? (
          <>
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
                      <button
                        type="button"
                        className="button-link button-link--danger"
                        disabled={deletingImageUrl === imageUrl}
                        onClick={() => void deleteImage(imageUrl)}
                      >
                        {deletingImageUrl === imageUrl
                          ? messages.adminImagesSaving
                          : messages.formPhotosRemoveButton}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            {orderedImages.length > 0 ? (
              <button
                type="button"
                className="button-link"
                onClick={() => void saveOrder()}
                disabled={savingImages}
              >
                {savingImages ? messages.adminImagesSaving : messages.adminImagesSave}
              </button>
            ) : null}
          </>
        ) : null}
        {status !== "idle" && statusMessage ? (
          <p className={`form-status ${status === "success" ? "success" : "error"}`}>
            {statusMessage}
          </p>
        ) : null}
      </article>
    </>
  );
}
