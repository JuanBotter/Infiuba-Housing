"use client";

import { FormEvent, useMemo, useState } from "react";

import { getMessages } from "@/lib/i18n";
import type { Lang } from "@/types";

interface ReviewFormProps {
  lang: Lang;
  listingId: string;
}

export function ReviewForm({ lang, listingId }: ReviewFormProps) {
  const t = useMemo(() => getMessages(lang), [lang]);
  const [rating, setRating] = useState("4");
  const [recommended, setRecommended] = useState("yes");
  const [comment, setComment] = useState("");
  const [semester, setSemester] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          listingId,
          rating: Number(rating),
          recommended: recommended === "yes",
          comment,
          semester,
          studentName,
          studentEmail,
        }),
      });

      if (!response.ok) {
        throw new Error("Request failed");
      }

      setStatus("success");
      setComment("");
      setSemester("");
      setStudentName("");
      setStudentEmail("");
      setRating("4");
      setRecommended("yes");
    } catch {
      setStatus("error");
    }
  }

  return (
    <form className="review-form" onSubmit={onSubmit}>
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

      <label>
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

      <label>
        <span>{t.formEmail}</span>
        <input
          type="email"
          value={studentEmail}
          onChange={(event) => setStudentEmail(event.target.value)}
          maxLength={120}
        />
      </label>

      <button type="submit" disabled={status === "sending"}>
        {status === "sending" ? t.formSending : t.formSubmit}
      </button>

      {status === "success" ? <p className="form-status success">{t.formSuccess}</p> : null}
      {status === "error" ? <p className="form-status error">{t.formError}</p> : null}
    </form>
  );
}
