"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getMessages } from "@/lib/i18n";
import {
  buildReviewPayload,
  createInitialReviewDraft,
  mapReviewApiErrorMessage,
  readApiErrorMessage,
} from "@/lib/review-form";
import { uploadReviewImageFiles } from "@/lib/review-image-upload";
import { MAX_REVIEW_IMAGE_COUNT } from "@/lib/review-images";
import { ContactRichText } from "@/components/contact-rich-text";
import { SEMESTER_OPTIONS } from "@/lib/semester-options";
import { StarRating } from "@/components/star-rating";
import { ImageGalleryViewer } from "@/components/image-gallery-viewer";
import { PhoneInputWithCountry } from "@/components/phone-input-with-country";
import type { Lang, Listing } from "@/types";

interface AddStayReviewFormProps {
  lang: Lang;
  listings: Listing[];
  neighborhoods: string[];
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

export function AddStayReviewForm({ lang, listings, neighborhoods }: AddStayReviewFormProps) {
  const t = useMemo(() => getMessages(lang), [lang]);
  const router = useRouter();

  const [address, setAddress] = useState("");
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [matchDecision, setMatchDecision] = useState<MatchDecision>("pending");

  const [neighborhood, setNeighborhood] = useState("");
  const [contacts, setContacts] = useState("");
  const [capacity, setCapacity] = useState("");
  const [reviewDraft, setReviewDraft] = useState(createInitialReviewDraft);
  const [isNeighborhoodOpen, setIsNeighborhoodOpen] = useState(false);
  const [uploadingReviewImages, setUploadingReviewImages] = useState(false);

  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [serverMessage, setServerMessage] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  function clearFormError(key: string) {
    setFormErrors((previous) => {
      if (!previous[key]) {
        return previous;
      }
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }

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

  async function uploadSelectedImages(
    files: File[],
    remainingSlots: number,
    maxCount: number,
    onSuccess: (urls: string[]) => void,
    setUploading: (value: boolean) => void,
  ) {
    if (remainingSlots <= 0) {
      setStatus("error");
      setServerMessage(t.formPhotosMaxError.replace("{count}", String(maxCount)));
      return;
    }

    setUploading(true);
    const uploaded = await uploadReviewImageFiles(files.slice(0, remainingSlots));
    setUploading(false);

    if (!uploaded.ok) {
      setStatus("error");
      setServerMessage(uploaded.error);
      return;
    }

    onSuccess(uploaded.urls);
    setStatus("idle");
    setServerMessage("");
  }

  async function onUploadReviewImages(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selectedFiles = Array.from(input.files || []);
    input.value = "";
    if (selectedFiles.length === 0) {
      return;
    }

    const remainingSlots = MAX_REVIEW_IMAGE_COUNT - reviewDraft.imageUrls.length;
    await uploadSelectedImages(
      selectedFiles,
      remainingSlots,
      MAX_REVIEW_IMAGE_COUNT,
      (urls) =>
        setReviewDraft((previous) => ({
          ...previous,
          imageUrls: [...previous.imageUrls, ...urls].slice(0, MAX_REVIEW_IMAGE_COUNT),
        })),
      setUploadingReviewImages,
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedListing && matchDecision === "pending") {
      setStatus("needsMatch");
      return;
    }

    const isNewListing = !selectedListing || matchDecision === "no";
    const nextErrors: Record<string, string> = {};
    const ratingValue = Number(reviewDraft.rating);
    const hasRating = Number.isFinite(ratingValue) && ratingValue > 0;
    const hasRecommendation =
      reviewDraft.recommended === "yes" || reviewDraft.recommended === "no";

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

    const priceValue = Number(reviewDraft.priceUsd);
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      nextErrors.priceUsd = t.formRequiredField;
    }

    if (!hasRating) {
      nextErrors.rating = t.formRequiredField;
    }
    if (!hasRecommendation) {
      nextErrors.recommended = t.formRequiredField;
    }
    if (reviewDraft.comment.trim().length < 12) {
      nextErrors.comment = t.formRequiredField;
    }
    if (!reviewDraft.semester.trim()) {
      nextErrors.semester = t.formRequiredField;
    }
    if (
      reviewDraft.shareContactInfo &&
      !reviewDraft.studentEmail.trim() &&
      !reviewDraft.studentContact.trim()
    ) {
      nextErrors.contactShare = t.formContactShareError;
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

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 503) {
        setStatus("unavailable");
        return;
      }
      if (!response.ok) {
        const apiError = await readApiErrorMessage(response);
        setServerMessage(mapReviewApiErrorMessage(apiError, t));
        setStatus("error");
        return;
      }

      setStatus("success");
      setServerMessage("");
      setFormErrors({});
      setReviewDraft(createInitialReviewDraft());
      setContacts("");
      setCapacity("");
      if (!useExistingListing) {
        setAddress("");
        setNeighborhood("");
      }
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  const showNewPropertyFields = !selectedListing || matchDecision === "no";
  const addressErrorId = formErrors.address ? "review-address-error" : undefined;
  const neighborhoodErrorId = formErrors.neighborhood ? "review-neighborhood-error" : undefined;
  const contactsErrorId = formErrors.contacts ? "review-contacts-error" : undefined;
  const capacityErrorId = formErrors.capacity ? "review-capacity-error" : undefined;
  const priceErrorId = formErrors.priceUsd ? "review-price-error" : undefined;
  const ratingErrorId = formErrors.rating ? "review-rating-error" : undefined;
  const recommendedErrorId = formErrors.recommended ? "review-recommended-error" : undefined;
  const commentErrorId = formErrors.comment ? "review-comment-error" : undefined;
  const semesterErrorId = formErrors.semester ? "review-semester-error" : undefined;
  const contactShareErrorId = formErrors.contactShare
    ? "review-contact-share-error"
    : undefined;

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

        <label className={formErrors.priceUsd ? "is-invalid" : ""}>
          <span>{t.formPriceLabel}</span>
          <input
            type="number"
            min={1}
            max={20000}
            step="0.01"
            value={reviewDraft.priceUsd}
            onChange={(event) => {
              setReviewDraft((previous) => ({ ...previous, priceUsd: event.target.value }));
              clearFormError("priceUsd");
            }}
            required
            aria-invalid={Boolean(formErrors.priceUsd)}
            aria-describedby={priceErrorId}
          />
          {formErrors.priceUsd ? (
            <p className="field-error" id={priceErrorId}>
              {formErrors.priceUsd}
            </p>
          ) : null}
        </label>

        <div className="review-rating-row review-rating-row--property property-form__full">
          <div className={`review-rating-field${formErrors.rating ? " is-invalid" : ""}`}>
            <StarRating
              name="review-rating"
              value={reviewDraft.rating}
              onChange={(nextValue) => {
                setReviewDraft((previous) => ({ ...previous, rating: nextValue }));
                clearFormError("rating");
              }}
              label={t.formRating}
              hint={t.formRatingHint}
              hasError={Boolean(formErrors.rating)}
              errorId={ratingErrorId}
            />
            {formErrors.rating ? (
              <p className="field-error" id={ratingErrorId}>
                {formErrors.rating}
              </p>
            ) : null}
          </div>

          <fieldset
            className={`review-choice${formErrors.recommended ? " is-invalid" : ""}`}
            aria-invalid={Boolean(formErrors.recommended)}
            aria-describedby={recommendedErrorId}
          >
            <legend>{t.formRecommended}</legend>
            <label className="review-choice__option">
              <input
                type="radio"
                name="review-recommend"
                value="yes"
                checked={reviewDraft.recommended === "yes"}
                onChange={() => {
                  setReviewDraft((previous) => ({ ...previous, recommended: "yes" }));
                  clearFormError("recommended");
                }}
              />
              <span>{t.yes}</span>
            </label>
            <label className="review-choice__option">
              <input
                type="radio"
                name="review-recommend"
                value="no"
                checked={reviewDraft.recommended === "no"}
                onChange={() => {
                  setReviewDraft((previous) => ({ ...previous, recommended: "no" }));
                  clearFormError("recommended");
                }}
              />
              <span>{t.no}</span>
            </label>
            {formErrors.recommended ? (
              <p className="field-error" id={recommendedErrorId}>
                {formErrors.recommended}
              </p>
            ) : null}
          </fieldset>
        </div>

        <label
          className={`property-form__full${formErrors.comment ? " is-invalid" : ""}`}
        >
          <span>{t.formComment}</span>
          <textarea
            value={reviewDraft.comment}
            onChange={(event) => {
              setReviewDraft((previous) => ({ ...previous, comment: event.target.value }));
              clearFormError("comment");
            }}
            minLength={12}
            maxLength={1000}
            required
            aria-invalid={Boolean(formErrors.comment)}
            aria-describedby={commentErrorId}
          />
          {formErrors.comment ? (
            <p className="field-error" id={commentErrorId}>
              {formErrors.comment}
            </p>
          ) : null}
        </label>

        <label className={formErrors.semester ? "is-invalid" : ""}>
          <span>{t.formSemester}</span>
          <input
            type="text"
            value={reviewDraft.semester}
            onChange={(event) => {
              setReviewDraft((previous) => ({ ...previous, semester: event.target.value }));
              clearFormError("semester");
            }}
            placeholder={t.formSemesterPlaceholder}
            list="semester-options"
            required
            maxLength={8}
            aria-invalid={Boolean(formErrors.semester)}
            aria-describedby={semesterErrorId}
          />
          {formErrors.semester ? (
            <p className="field-error" id={semesterErrorId}>
              {formErrors.semester}
            </p>
          ) : null}
          <datalist id="semester-options">
            {SEMESTER_OPTIONS.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </label>

        <fieldset className="review-images property-form__full">
          <legend>{t.formReviewPhotosLabel}</legend>
          <p className="review-images__hint">
            {t.formPhotosHint.replace("{count}", String(MAX_REVIEW_IMAGE_COUNT))}
          </p>
          <label className="button-link review-images__upload">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              multiple
              onChange={(event) => void onUploadReviewImages(event)}
              disabled={
                uploadingReviewImages || reviewDraft.imageUrls.length >= MAX_REVIEW_IMAGE_COUNT
              }
            />
            <span>{uploadingReviewImages ? t.formPhotosUploading : t.formPhotosUploadButton}</span>
          </label>
          {reviewDraft.imageUrls.length > 0 ? (
            <ImageGalleryViewer
              lang={lang}
              images={reviewDraft.imageUrls}
              altBase={t.imageAltReview}
              ariaLabel={t.imageAriaSelectedReviewPhotos}
              onRemoveImage={(index) =>
                setReviewDraft((previous) => ({
                  ...previous,
                  imageUrls: previous.imageUrls.filter(
                    (_, imageIndex) => imageIndex !== index,
                  ),
                }))
              }
              removeLabel={t.formPhotosRemoveButton}
            />
          ) : null}
        </fieldset>

        <fieldset
          className={`contact-section property-form__full${
            formErrors.contactShare ? " is-invalid" : ""
          }`}
          aria-invalid={Boolean(formErrors.contactShare)}
          aria-describedby={contactShareErrorId}
        >
          <legend>{t.formContactSection}</legend>
          <label>
            <span>{t.formName}</span>
            <input
              type="text"
              value={reviewDraft.studentName}
              onChange={(event) =>
                setReviewDraft((previous) => ({ ...previous, studentName: event.target.value }))
              }
              maxLength={80}
            />
          </label>

          <label>
            <span>{t.formPhone}</span>
            <PhoneInputWithCountry
              lang={lang}
              value={reviewDraft.studentContact}
              onChange={(nextValue) => {
                setReviewDraft((previous) => ({
                  ...previous,
                  studentContact: nextValue,
                }));
                clearFormError("contactShare");
              }}
              maxLength={120}
              pickerLabel={t.phoneCountryPickerLabel}
              searchPlaceholder={t.phoneCountrySearchPlaceholder}
              noResultsLabel={t.phoneCountryNoResults}
              numberPlaceholder={t.phoneNumberPlaceholder}
            />
          </label>

          <label>
            <span>{t.formEmail}</span>
            <input
              type="email"
              value={reviewDraft.studentEmail}
              onChange={(event) => {
                setReviewDraft((previous) => ({ ...previous, studentEmail: event.target.value }));
                clearFormError("contactShare");
              }}
              maxLength={120}
            />
          </label>

          <label className="consent-checkbox">
            <input
              type="checkbox"
              checked={reviewDraft.shareContactInfo}
              onChange={(event) => {
                setReviewDraft((previous) => ({
                  ...previous,
                  shareContactInfo: event.target.checked,
                }));
                if (!event.target.checked) {
                  clearFormError("contactShare");
                }
              }}
            />
            <span>{t.formContactConsentLabel}</span>
            <small>{t.formContactConsentHint}</small>
          </label>
          {formErrors.contactShare ? (
            <p className="field-error" id={contactShareErrorId}>
              {formErrors.contactShare}
            </p>
          ) : null}
        </fieldset>

        <button type="submit" disabled={status === "sending"}>
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
        <p className="form-status error">{serverMessage || t.formError}</p>
      ) : null}
    </article>
  );
}
