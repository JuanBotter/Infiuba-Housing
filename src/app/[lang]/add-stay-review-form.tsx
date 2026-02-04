"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getMessages } from "@/lib/i18n";
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

export function AddStayReviewForm({ lang, listings }: AddStayReviewFormProps) {
  const t = useMemo(() => getMessages(lang), [lang]);
  const router = useRouter();

  const [address, setAddress] = useState("");
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [matchDecision, setMatchDecision] = useState<MatchDecision>("pending");

  const [neighborhood, setNeighborhood] = useState("");
  const [contacts, setContacts] = useState("");
  const [priceUsd, setPriceUsd] = useState("");
  const [capacity, setCapacity] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const [rating, setRating] = useState("4");
  const [recommended, setRecommended] = useState("yes");
  const [comment, setComment] = useState("");
  const [semester, setSemester] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentContact, setStudentContact] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [shareContactInfo, setShareContactInfo] = useState(false);

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
      rating: Number(rating),
      recommended: recommended === "yes",
      comment,
      priceUsd: priceUsd ? Number(priceUsd) : undefined,
      semester,
      studentName,
      studentContact,
      studentEmail,
      shareContactInfo,
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
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setServerMessage(body.error || "");
        setStatus("error");
        return;
      }

      setStatus("success");
      setServerMessage("");
      setComment("");
      setSemester("");
      setStudentName("");
      setStudentContact("");
      setStudentEmail("");
      setShareContactInfo(false);
      setRating("4");
      setRecommended("yes");
      setContacts("");
      setPriceUsd("");
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
                  {selectedListing.contacts.length > 0
                    ? selectedListing.contacts.join(" · ")
                    : "-"}
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
            value={priceUsd}
            onChange={(event) => setPriceUsd(event.target.value)}
          />
        </label>

        <label>
          <span>{t.formRating}</span>
          <input
            type="number"
            min={1}
            max={5}
            step={1}
            value={rating}
            onChange={(event) => setRating(event.target.value)}
            required
          />
        </label>

        <label>
          <span>{t.formRecommended}</span>
          <select value={recommended} onChange={(event) => setRecommended(event.target.value)}>
            <option value="yes">{t.yes}</option>
            <option value="no">{t.no}</option>
          </select>
        </label>

        <label className="property-form__full">
          <span>{t.formComment}</span>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            minLength={12}
            maxLength={1000}
            required
          />
        </label>

        <label>
          <span>{t.formSemester}</span>
          <input
            type="text"
            value={semester}
            onChange={(event) => setSemester(event.target.value)}
            maxLength={60}
          />
        </label>

        <label>
          <span>{t.formName}</span>
          <input
            type="text"
            value={studentName}
            onChange={(event) => setStudentName(event.target.value)}
            maxLength={80}
          />
        </label>

        <label className="property-form__full">
          <span>{t.formPhone}</span>
          <input
            type="text"
            value={studentContact}
            onChange={(event) => setStudentContact(event.target.value)}
            maxLength={120}
          />
        </label>

        <label className="property-form__full">
          <span>{t.formEmail}</span>
          <input
            type="email"
            value={studentEmail}
            onChange={(event) => setStudentEmail(event.target.value)}
            maxLength={120}
          />
        </label>

        <label className="property-form__full consent-checkbox">
          <input
            type="checkbox"
            checked={shareContactInfo}
            onChange={(event) => setShareContactInfo(event.target.checked)}
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
