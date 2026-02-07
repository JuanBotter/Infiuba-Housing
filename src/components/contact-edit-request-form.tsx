"use client";

import { useEffect, useMemo, useState } from "react";

import { splitContactParts } from "@/lib/contact-links";
import type { Messages } from "@/i18n/messages";

interface ContactEditRequestFormProps {
  listingId: string;
  currentContacts: string[];
  messages: Messages;
  compact?: boolean;
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

export function ContactEditRequestForm({
  listingId,
  currentContacts,
  messages,
  compact,
}: ContactEditRequestFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [contactsDraft, setContactsDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  const initialValue = useMemo(
    () => currentContacts.filter(Boolean).join("\n"),
    [currentContacts],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setContactsDraft(initialValue);
    setStatus("idle");
    setError("");
    setFieldError("");
  }, [initialValue, isOpen]);

  async function submitRequest() {
    if (!contactsDraft.trim()) {
      setStatus("error");
      setError(messages.formRequiredFieldsError);
      setFieldError(messages.formRequiredField);
      return;
    }
    setStatus("sending");
    setError("");
    setFieldError("");
    try {
      const response = await fetch("/api/contact-edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          contacts: contactsDraft,
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
                  <li key={contact}>{renderContactValue(contact)}</li>
                ))}
              </ul>
            ) : (
              <p className="contact-edit__empty">-</p>
            )}
          </div>

          <label className="contact-edit__input">
            <span>{messages.contactEditNewLabel}</span>
            <textarea
              value={contactsDraft}
              onChange={(event) => {
                setContactsDraft(event.target.value);
                setFieldError("");
              }}
              placeholder={messages.contactEditPlaceholder}
              rows={4}
              required
            />
            {fieldError ? <p className="field-error">{fieldError}</p> : null}
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
