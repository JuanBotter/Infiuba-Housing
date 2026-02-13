"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ContactRichText } from "@/components/contact-rich-text";
import { ReviewCoreFields } from "@/components/review-core-fields";
import type { Messages } from "@/i18n/messages";
import {
  buildReviewPayload,
  getReviewFormErrorSummaryItems,
  submitReview,
} from "@/lib/review-form";
import { useReviewFormCore } from "@/lib/use-review-form-core";
import type { Lang, Listing } from "@/types";

interface AddStayReviewFormProps {
  lang: Lang;
  messages: Messages;
  listings: Listing[];
  neighborhoods: string[];
  canUploadImages?: boolean;
}

type MatchDecision = "pending" | "yes" | "no";
type SubmitStatus = "idle" | "sending" | "success" | "error" | "unavailable" | "needsMatch";

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function AddStayReviewForm({
  lang,
  messages,
  listings,
  neighborhoods,
  canUploadImages = true,
}: AddStayReviewFormProps) {
  const t = messages;
  const router = useRouter();

  const [address, setAddress] = useState("");
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [matchDecision, setMatchDecision] = useState<MatchDecision>("pending");

  const [neighborhood, setNeighborhood] = useState("");
  const [contacts, setContacts] = useState("");
  const [capacity, setCapacity] = useState("");
  const {
    reviewDraft,
    setReviewDraft,
    formErrors,
    setFormErrors,
    clearFormError,
    uploadingImages: uploadingReviewImages,
    uploadReviewImages,
    removeReviewImage,
    validateDraft,
    resetDraft,
  } = useReviewFormCore(t);
  const [isNeighborhoodOpen, setIsNeighborhoodOpen] = useState(false);

  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [serverMessage, setServerMessage] = useState("");
  const errorSummaryItems =
    status === "error" ? getReviewFormErrorSummaryItems(formErrors, t) : [];

  const selectedListing = useMemo(
    () => listings.find((listing) => listing.id === selectedListingId) || null,
    [listings, selectedListingId],
  );

  const neighborhoodOptions = useMemo(() => {
    const normalized = neighborhoods.length ? neighborhoods : listings.map((listing) => listing.neighborhood);
    return [...new Set(normalized)].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [listings, neighborhoods]);

  const neighborhoodMatches = useMemo(() => {
    const query = normalizeText(neighborhood);
    if (!query) {
      return [];
    }
    return neighborhoodOptions
      .filter((option) => normalizeText(option).includes(query))
      .slice(0, 8);
  }, [neighborhood, neighborhoodOptions]);

  const matches = useMemo(() => {
    const query = normalizeText(address);
    if (query.length < 3) {
      return [];
    }

    return listings
      .filter((listing) => {
        const haystack = normalizeText(`${listing.address} ${listing.neighborhood}`);
        return haystack.includes(query);
      })
      .slice(0, 7);
  }, [address, listings]);

  function handleAddressChange(nextAddress: string) {
    setAddress(nextAddress);
    clearFormError("address");
    if (selectedListing && normalizeText(nextAddress) !== normalizeText(selectedListing.address)) {
      setSelectedListingId(null);
      setMatchDecision("pending");
    }
  }

  function handleSelectListing(listing: Listing) {
    setSelectedListingId(listing.id);
    setAddress(listing.address);
    setNeighborhood(listing.neighborhood);
    clearFormError("address");
    clearFormError("neighborhood");
    setMatchDecision("pending");
    setStatus("idle");
  }

  async function onUploadReviewImages(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selectedFiles = Array.from(input.files || []);
    input.value = "";
    if (selectedFiles.length === 0) {
      return;
    }

    const uploaded = await uploadReviewImages(selectedFiles);
    if (!uploaded.ok) {
      setStatus("error");
      setServerMessage(uploaded.message);
      return;
    }

    setStatus("idle");
    setServerMessage("");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploadingReviewImages) {
      setStatus("error");
      setServerMessage(t.formUploadsInProgressError);
      return;
    }

    if (selectedListing && matchDecision === "pending") {
      setStatus("needsMatch");
      return;
    }

    const isNewListing = !selectedListing || matchDecision === "no";
    const nextErrors: Record<string, string> = {
      ...validateDraft(),
    };

    if (isNewListing) {
      if (address.trim().length < 6) {
        nextErrors.address = t.formRequiredField;
      }
      if (neighborhood.trim().length < 2) {
        nextErrors.neighborhood = t.formRequiredField;
      }
      if (!contacts.trim()) {
        nextErrors.contacts = t.formRequiredField;
      }

      const capacityValue = Number(capacity);
      if (!Number.isFinite(capacityValue) || capacityValue <= 0) {
        nextErrors.capacity = t.formRequiredField;
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      setStatus("error");
      setServerMessage(t.formRequiredFieldsError);
      return;
    }

    setStatus("sending");
    setServerMessage("");
    setFormErrors({});

    const useExistingListing = Boolean(selectedListing && matchDecision === "yes");
    const payload: Record<string, unknown> = {
      ...buildReviewPayload(reviewDraft),
    };

    if (useExistingListing) {
      payload.listingId = selectedListing?.id;
      payload.confirmExistingDetails = true;
    } else {
      payload.address = address;
      payload.neighborhood = neighborhood;
      payload.contacts = contacts;
      payload.capacity = capacity ? Number(capacity) : undefined;
    }

    const submitResult = await submitReview(payload, t);
    if (!submitResult.ok) {
      if (submitResult.kind === "unavailable") {
        setStatus("unavailable");
        return;
      }
      setServerMessage(submitResult.message);
      setStatus("error");
      return;
    }

    setStatus("success");
    setServerMessage("");
    setFormErrors({});
    resetDraft();
    setContacts("");
    setCapacity("");
    if (!useExistingListing) {
      setAddress("");
      setNeighborhood("");
    }
    router.refresh();
  }

  const showNewPropertyFields = !selectedListing || matchDecision === "no";
  const addressErrorId = formErrors.address ? "review-address-error" : undefined;
  const neighborhoodErrorId = formErrors.neighborhood ? "review-neighborhood-error" : undefined;
  const contactsErrorId = formErrors.contacts ? "review-contacts-error" : undefined;
  const capacityErrorId = formErrors.capacity ? "review-capacity-error" : undefined;

  return (
    <article className="detail-card property-form-card">
      <h2>{t.addReviewTitle}</h2>
      <p>{t.addReviewSubtitle}</p>

      <form className="property-form" onSubmit={onSubmit} noValidate>
        <label
          className={`property-form__full${formErrors.address ? " is-invalid" : ""}`}
        >
          <span>{t.addPropertyAddressLabel}</span>
          <input
            type="text"
            value={address}
            onChange={(event) => handleAddressChange(event.target.value)}
            placeholder={t.searchPlaceholder}
            minLength={6}
            maxLength={180}
            required
            aria-invalid={Boolean(formErrors.address)}
            aria-describedby={addressErrorId}
          />
          {formErrors.address ? (
            <p className="field-error" id={addressErrorId}>
              {formErrors.address}
            </p>
          ) : null}
        </label>

        {matches.length > 0 ? (
          <div className="property-form__full suggestions-list" role="listbox" aria-label={t.searchLabel}>
            {matches.map((listing) => (
              <button
                key={listing.id}
                type="button"
                className={`suggestions-list__item ${
                  selectedListing?.id === listing.id ? "is-selected" : ""
                }`}
                onClick={() => handleSelectListing(listing)}
              >
                <strong>{listing.address}</strong>
                <span>{listing.neighborhood}</span>
              </button>
            ))}
          </div>
        ) : null}

        {selectedListing ? (
          <div className="property-form__full selected-property-note">
            <p>
              <strong>{selectedListing.address}</strong> · {selectedListing.neighborhood}
            </p>
            <div className="selected-property-meta">
              <p>
                <span>{t.ownerContacts}</span>
                <strong>
                  {selectedListing.contacts.length > 0 ? (
                    selectedListing.contacts.map((contact, index) => (
                      <span key={contact}>
                        <ContactRichText contact={contact} />
                        {index < selectedListing.contacts.length - 1 ? " · " : ""}
                      </span>
                    ))
                  ) : (
                    "-"
                  )}
                </strong>
              </p>
            </div>
            <fieldset>
              <legend>{t.addReviewExistingMatchQuestion}</legend>
              <label>
                <input
                  type="radio"
                  name="matchDecision"
                  value="yes"
                  checked={matchDecision === "yes"}
                  onChange={() => setMatchDecision("yes")}
                />
                <span>{t.addReviewExistingMatchYes}</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="matchDecision"
                  value="no"
                  checked={matchDecision === "no"}
                  onChange={() => setMatchDecision("no")}
                />
                <span>{t.addReviewExistingMatchNo}</span>
              </label>
            </fieldset>
          </div>
        ) : null}

        {showNewPropertyFields ? (
          <>
            <label
              className={`input-suggest${formErrors.neighborhood ? " is-invalid" : ""}`}
            >
              <span>{t.neighborhoodLabel}</span>
              <input
                type="text"
                value={neighborhood}
                onChange={(event) => {
                  setNeighborhood(event.target.value);
                  clearFormError("neighborhood");
                }}
                placeholder={t.addPropertyNeighborhoodPlaceholder}
                minLength={2}
                maxLength={80}
                onFocus={() => setIsNeighborhoodOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => setIsNeighborhoodOpen(false), 120);
                }}
                required
                aria-invalid={Boolean(formErrors.neighborhood)}
                aria-describedby={neighborhoodErrorId}
              />
              {formErrors.neighborhood ? (
                <p className="field-error" id={neighborhoodErrorId}>
                  {formErrors.neighborhood}
                </p>
              ) : null}
              {isNeighborhoodOpen && neighborhoodMatches.length > 0 ? (
                <ul className="input-suggest__list" role="listbox">
                  {neighborhoodMatches.map((option) => (
                    <li key={option} role="option">
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setNeighborhood(option);
                          clearFormError("neighborhood");
                          setIsNeighborhoodOpen(false);
                        }}
                      >
                        {option}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </label>

            <label className={formErrors.contacts ? "is-invalid" : ""}>
              <span>{t.addPropertyContactsLabel}</span>
              <textarea
                value={contacts}
                onChange={(event) => {
                  setContacts(event.target.value);
                  clearFormError("contacts");
                }}
                maxLength={500}
                placeholder={t.addPropertyContactsPlaceholder}
                required
                aria-invalid={Boolean(formErrors.contacts)}
                aria-describedby={contactsErrorId}
              />
              {formErrors.contacts ? (
                <p className="field-error" id={contactsErrorId}>
                  {formErrors.contacts}
                </p>
              ) : null}
            </label>

            <label className={formErrors.capacity ? "is-invalid" : ""}>
              <span>{t.capacityLabel}</span>
              <input
                type="number"
                min={1}
                max={50}
                step={1}
                value={capacity}
                onChange={(event) => {
                  setCapacity(event.target.value);
                  clearFormError("capacity");
                }}
                required
                aria-invalid={Boolean(formErrors.capacity)}
                aria-describedby={capacityErrorId}
              />
              {formErrors.capacity ? (
                <p className="field-error" id={capacityErrorId}>
                  {formErrors.capacity}
                </p>
              ) : null}
            </label>

          </>
        ) : null}

        <ReviewCoreFields
          lang={lang}
          messages={t}
          reviewDraft={reviewDraft}
          formErrors={formErrors}
          setReviewDraft={setReviewDraft}
          clearFormError={clearFormError}
          uploadingImages={uploadingReviewImages}
          onUploadImages={onUploadReviewImages}
          onRemoveImage={removeReviewImage}
          canUploadImages={canUploadImages}
          idPrefix="review"
          ratingName="review-rating"
          recommendationName="review-recommend"
          variant="property"
        />

        <button type="submit" disabled={status === "sending" || uploadingReviewImages}>
          {status === "sending" ? t.formSending : t.addReviewSubmit}
        </button>
      </form>

      {status === "success" ? <p className="form-status success">{t.formSuccess}</p> : null}
      {status === "needsMatch" ? (
        <p className="form-status error">{t.addReviewNeedMatchChoice}</p>
      ) : null}
      {status === "unavailable" ? (
        <p className="form-status error">{t.addReviewUnavailableError}</p>
      ) : null}
      {status === "error" ? (
        <div role="alert" aria-live="polite">
          <p className="form-status error">{serverMessage || t.formError}</p>
          {errorSummaryItems.length > 0 ? (
            <ul className="form-status-list error">
              {errorSummaryItems.map((item) => (
                <li key={item.key}>
                  {item.message === t.formRequiredField
                    ? item.label
                    : `${item.label}: ${item.message}`}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
