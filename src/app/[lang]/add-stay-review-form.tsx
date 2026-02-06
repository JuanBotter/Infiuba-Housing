"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getMessages } from "@/lib/i18n";
import {
  buildReviewPayload,
  createInitialReviewDraft,
  readApiErrorMessage,
} from "@/lib/review-form";
import { splitContactParts } from "@/lib/contact-links";
import { SEMESTER_OPTIONS } from "@/lib/semester-options";
import type { Lang, Listing } from "@/types";

interface AddStayReviewFormProps {
  lang: Lang;
  listings: Listing[];
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

export function AddStayReviewForm({ lang, listings }: AddStayReviewFormProps) {
  const t = useMemo(() => getMessages(lang), [lang]);
  const router = useRouter();

  const [address, setAddress] = useState("");
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [matchDecision, setMatchDecision] = useState<MatchDecision>("pending");

  const [neighborhood, setNeighborhood] = useState("");
  const [contacts, setContacts] = useState("");
  const [capacity, setCapacity] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [reviewDraft, setReviewDraft] = useState(createInitialReviewDraft);

  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [serverMessage, setServerMessage] = useState("");

  const selectedListing = useMemo(
    () => listings.find((listing) => listing.id === selectedListingId) || null,
    [listings, selectedListingId],
  );

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
    if (selectedListing && normalizeText(nextAddress) !== normalizeText(selectedListing.address)) {
      setSelectedListingId(null);
      setMatchDecision("pending");
    }
  }

  function handleSelectListing(listing: Listing) {
    setSelectedListingId(listing.id);
    setAddress(listing.address);
    setNeighborhood(listing.neighborhood);
    setMatchDecision("pending");
    setStatus("idle");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedListing && matchDecision === "pending") {
      setStatus("needsMatch");
      return;
    }

    setStatus("sending");
    setServerMessage("");

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
      payload.latitude = latitude ? Number(latitude) : undefined;
      payload.longitude = longitude ? Number(longitude) : undefined;
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
        setServerMessage(await readApiErrorMessage(response));
        setStatus("error");
        return;
      }

      setStatus("success");
      setServerMessage("");
      setReviewDraft(createInitialReviewDraft());
      setContacts("");
      setCapacity("");
      setLatitude("");
      setLongitude("");
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

  return (
    <article className="detail-card property-form-card">
      <h2>{t.addReviewTitle}</h2>
      <p>{t.addReviewSubtitle}</p>

      <form className="property-form" onSubmit={onSubmit}>
        <label className="property-form__full">
          <span>{t.addPropertyAddressLabel}</span>
          <input
            type="text"
            value={address}
            onChange={(event) => handleAddressChange(event.target.value)}
            placeholder={t.searchPlaceholder}
            minLength={6}
            maxLength={180}
            required
          />
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
                        {renderContactValue(contact)}
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
            <label>
              <span>{t.neighborhoodLabel}</span>
              <input
                type="text"
                value={neighborhood}
                onChange={(event) => setNeighborhood(event.target.value)}
                placeholder={t.addPropertyNeighborhoodPlaceholder}
                minLength={2}
                maxLength={80}
                required
              />
            </label>

            <label>
              <span>{t.addPropertyContactsLabel}</span>
              <textarea
                value={contacts}
                onChange={(event) => setContacts(event.target.value)}
                maxLength={500}
                placeholder={t.addPropertyContactsPlaceholder}
              />
            </label>

            <label>
              <span>{t.capacityLabel}</span>
              <input
                type="number"
                min={1}
                max={50}
                step={1}
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
              />
            </label>

            <label>
              <span>{t.addPropertyLatitudeLabel}</span>
              <input
                type="number"
                min={-90}
                max={90}
                step="any"
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
              />
            </label>

            <label>
              <span>{t.addPropertyLongitudeLabel}</span>
              <input
                type="number"
                min={-180}
                max={180}
                step="any"
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
              />
            </label>

            <p className="property-form__hint">{t.addPropertyCoordinatesHint}</p>
          </>
        ) : null}

        <label>
          <span>{t.priceLabel}</span>
          <input
            type="number"
            min={1}
            max={20000}
            step="0.01"
            value={reviewDraft.priceUsd}
            onChange={(event) =>
              setReviewDraft((previous) => ({ ...previous, priceUsd: event.target.value }))
            }
          />
        </label>

        <label>
          <span>{t.formRating}</span>
          <input
            type="number"
            min={1}
            max={5}
            step={1}
            value={reviewDraft.rating}
            onChange={(event) =>
              setReviewDraft((previous) => ({ ...previous, rating: event.target.value }))
            }
            required
          />
        </label>

        <label>
          <span>{t.formRecommended}</span>
          <select
            value={reviewDraft.recommended}
            onChange={(event) =>
              setReviewDraft((previous) => ({
                ...previous,
                recommended: event.target.value === "no" ? "no" : "yes",
              }))
            }
          >
            <option value="yes">{t.yes}</option>
            <option value="no">{t.no}</option>
          </select>
        </label>

        <label className="property-form__full">
          <span>{t.formComment}</span>
          <textarea
            value={reviewDraft.comment}
            onChange={(event) =>
              setReviewDraft((previous) => ({ ...previous, comment: event.target.value }))
            }
            minLength={12}
            maxLength={1000}
            required
          />
        </label>

        <label>
          <span>{t.formSemester}</span>
          <input
            type="text"
            value={reviewDraft.semester}
            onChange={(event) =>
              setReviewDraft((previous) => ({ ...previous, semester: event.target.value }))
            }
            placeholder={t.formSemesterPlaceholder}
            list="semester-options"
            required
            maxLength={8}
          />
          <datalist id="semester-options">
            {SEMESTER_OPTIONS.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </label>

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

        <label className="property-form__full">
          <span>{t.formPhone}</span>
          <input
            type="text"
            value={reviewDraft.studentContact}
            onChange={(event) =>
              setReviewDraft((previous) => ({
                ...previous,
                studentContact: event.target.value,
              }))
            }
            maxLength={120}
          />
        </label>

        <label className="property-form__full">
          <span>{t.formEmail}</span>
          <input
            type="email"
            value={reviewDraft.studentEmail}
            onChange={(event) =>
              setReviewDraft((previous) => ({ ...previous, studentEmail: event.target.value }))
            }
            maxLength={120}
          />
        </label>

        <label className="property-form__full consent-checkbox">
          <input
            type="checkbox"
            checked={reviewDraft.shareContactInfo}
            onChange={(event) =>
              setReviewDraft((previous) => ({
                ...previous,
                shareContactInfo: event.target.checked,
              }))
            }
          />
          <span>{t.formContactConsentLabel}</span>
          <small>{t.formContactConsentHint}</small>
        </label>

        <button type="submit" disabled={status === "sending"}>
          {status === "sending" ? t.formSending : t.addReviewSubmit}
        </button>
      </form>

      {status === "success" ? <p className="form-status success">{t.formSuccess}</p> : null}
      {status === "needsMatch" ? (
        <p className="form-status error">{t.addReviewNeedMatchChoice}</p>
      ) : null}
      {status === "unavailable" ? (
        <p className="form-status error">{t.addPropertyUnavailableError}</p>
      ) : null}
      {status === "error" ? (
        <p className="form-status error">{serverMessage || t.formError}</p>
      ) : null}
    </article>
  );
}
