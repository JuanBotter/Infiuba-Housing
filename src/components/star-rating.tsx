"use client";

import { type CSSProperties } from "react";

interface StarRatingProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  hint?: string;
  errorId?: string;
  hasError?: boolean;
  name: string;
}

export function StarRating({
  value,
  onChange,
  label,
  hint,
  errorId,
  hasError,
  name,
}: StarRatingProps) {
  const numericValue = Number(value);
  const clampedValue = Number.isFinite(numericValue) ? Math.max(0, Math.min(5, numericValue)) : 0;
  const hintId = hint ? `${name}-hint` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const percent = Math.max(0, Math.min(100, (clampedValue / 5) * 100));
  const style = { "--rating-percent": `${percent}%` } as CSSProperties;

  return (
    <div className={`star-rating${hasError ? " is-invalid" : ""}`}>
      <span className="star-rating__label">{label}</span>
      <div className="star-rating__slider" style={style}>
        <input
          className="star-rating__input"
          type="range"
          min={0}
          max={5}
          step={1}
          value={clampedValue}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          aria-describedby={describedBy}
          aria-valuemin={0}
          aria-valuemax={5}
          aria-valuenow={clampedValue}
          aria-valuetext={`${clampedValue} / 5`}
          name={name}
          required
        />
        <div className="star-rating__stars" aria-hidden="true">
          <div className="star-rating__stars-base">
            <StarIcon />
            <StarIcon />
            <StarIcon />
            <StarIcon />
            <StarIcon />
          </div>
          <div className="star-rating__stars-fill">
            <StarIcon />
            <StarIcon />
            <StarIcon />
            <StarIcon />
            <StarIcon />
          </div>
        </div>
      </div>
      {hint ? (
        <small className="star-rating__hint" id={hintId}>
          {hint}
        </small>
      ) : null}
    </div>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 3.5l2.95 6.03 6.65.97-4.8 4.68 1.13 6.61L12 18.9l-5.93 3.12 1.13-6.61-4.8-4.68 6.65-.97L12 3.5z"
      />
    </svg>
  );
}
