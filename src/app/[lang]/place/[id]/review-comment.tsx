"use client";

import { useState } from "react";

interface ReviewCommentProps {
  comment: string;
  translatedComment?: string;
  originalComment?: string;
  showOriginalLabel: string;
  showTranslationLabel: string;
}

export function ReviewComment({
  comment,
  translatedComment,
  originalComment,
  showOriginalLabel,
  showTranslationLabel,
}: ReviewCommentProps) {
  const hasTranslation =
    Boolean(translatedComment) &&
    Boolean(originalComment) &&
    translatedComment !== originalComment;

  const [showOriginal, setShowOriginal] = useState(false);

  if (!hasTranslation) {
    return <p>{comment}</p>;
  }

  return (
    <div className="review-comment">
      <p>{showOriginal ? originalComment : translatedComment}</p>
      <button
        type="button"
        className="review-comment__toggle"
        onClick={() => setShowOriginal((value) => !value)}
      >
        {showOriginal ? showTranslationLabel : showOriginalLabel}
      </button>
    </div>
  );
}
