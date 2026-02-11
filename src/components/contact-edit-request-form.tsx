"use client";

import { useEffect, useMemo, useState } from "react";

import { ContactRichText } from "@/components/contact-rich-text";
import type { Messages } from "@/i18n/messages";

interface ContactEditRequestFormProps {
  listingId: string;
  currentContacts: string[];
  currentCapacity?: number;
  messages: Messages;
  compact?: boolean;
}

export function ContactEditRequestForm({
  listingId,
  currentContacts,
  currentCapacity,
  messages,
  compact,
}: ContactEditRequestFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [contactsDraft, setContactsDraft] = useState("");
  const [capacityDraft, setCapacityDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [contactError, setContactError] = useState("");
  const [capacityError, setCapacityError] = useState("");

  const initialValue = useMemo(
    () => currentContacts.filter(Boolean).join("\n"),
    [currentContacts],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setContactsDraft(initialValue);
    setCapacityDraft("");
    setStatus("idle");
    setError("");
    setContactError("");
    setCapacityError("");
  }, [initialValue, isOpen]);

  async function submitRequest() {
    const capacityValue =
      capacityDraft.trim() === "" ? undefined : Number(capacityDraft.trim());
    if (
      capacityValue !== undefined &&
      (!Number.isFinite(capacityValue) || capacityValue <= 0 || capacityValue > 50)
    ) {
      setStatus("error");
      setError(messages.formRequiredFieldsError);
      setCapacityError(messages.formRequiredField);
      return;
    }
    setStatus("sending");
    setError("");
    setContactError("");
    setCapacityError("");
    if (!contactsDraft.trim() && capacityValue === undefined) {
      setStatus("error");
      setError(messages.formRequiredFieldsError);
      setContactError(messages.formRequiredField);
      setCapacityError(messages.formRequiredField);
      return;
    }
    try {
      const response = await fetch("/api/contact-edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          contacts: contactsDraft,
          capacity: capacityDraft,
        }),
      });

      if (response.status === 401) {
        setStatus("error");
        setError(messages.contactEditAuthError);
        return;
      }
      if (!response.ok) {
        setStatus("error");
        setError(messages.contactEditError);
        return;
      }

      setStatus("success");
    } catch {
      setStatus("error");
      setError(messages.contactEditError);
    }
  }

  return (
    <div className={`contact-edit${compact ? " contact-edit--compact" : ""}`}>
      <button
        type="button"
        className="contact-edit__toggle"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
      >
        <span className="contact-edit__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path
              fill="currentColor"
              d="M3 17.25V21h3.75l11-11-3.75-3.75-11 11zm2.92 2.83H5v-.92l8.62-8.62.92.92-8.62 8.62zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.66 1.66 3.75 3.75 1.66-1.66z"
            />
          </svg>
        </span>
        {messages.contactEditAction}
      </button>

      {isOpen ? (
        <div className="contact-edit__panel">
          {compact ? null : (
            <>
              <h3>{messages.contactEditTitle}</h3>
              <p className="contact-edit__subtitle">{messages.contactEditSubtitle}</p>
            </>
          )}

          <div className="contact-edit__current">
            <p className="contact-edit__label">{messages.contactEditCurrentLabel}</p>
            {currentContacts.length > 0 ? (
              <ul className="contact-list contact-edit__list">
                {currentContacts.map((contact) => (
                  <li key={contact}>
                    <ContactRichText contact={contact} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="contact-edit__empty">-</p>
            )}
          </div>
          <div className="contact-edit__current">
            <p className="contact-edit__label">{messages.contactEditCurrentCapacityLabel}</p>
            <p className={typeof currentCapacity === "number" ? "" : "contact-edit__empty"}>
              {typeof currentCapacity === "number"
                ? `${Math.round(currentCapacity)} ${messages.studentsSuffix}`
                : "-"}
            </p>
          </div>

          <label className="contact-edit__input">
            <span>{messages.contactEditNewLabel}</span>
            <textarea
              value={contactsDraft}
              onChange={(event) => {
                setContactsDraft(event.target.value);
                setContactError("");
              }}
              placeholder={messages.contactEditPlaceholder}
              rows={4}
            />
            {contactError ? <p className="field-error">{contactError}</p> : null}
          </label>

          <label className="contact-edit__input">
            <span>{messages.contactEditCapacityLabel}</span>
            <input
              type="number"
              min={1}
              max={50}
              step={1}
              value={capacityDraft}
              onChange={(event) => {
                setCapacityDraft(event.target.value);
                setCapacityError("");
              }}
              placeholder={messages.contactEditCapacityPlaceholder}
            />
            {capacityError ? <p className="field-error">{capacityError}</p> : null}
          </label>

          <div className="contact-edit__actions">
            <button
              type="button"
              className="button-link"
              onClick={() => void submitRequest()}
              disabled={status === "sending"}
            >
              {status === "sending" ? messages.formSending : messages.contactEditSubmit}
            </button>
            {status === "success" ? (
              <p className="form-status success">{messages.contactEditSuccess}</p>
            ) : null}
            {status === "error" ? (
              <p className="form-status error">{error || messages.contactEditError}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
