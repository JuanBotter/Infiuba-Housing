"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

interface ImageGalleryViewerProps {
  images: string[];
  altBase: string;
  ariaLabel?: string;
  variant?: "default" | "property";
  onRemoveImage?: (index: number) => void;
  removeLabel?: string;
}

function cycleIndex(current: number, total: number, delta: number) {
  return (current + delta + total) % total;
}

export function ImageGalleryViewer({
  images,
  altBase,
  ariaLabel,
  variant = "default",
  onRemoveImage,
  removeLabel,
}: ImageGalleryViewerProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const validImages = useMemo(
    () =>
      images
        .map((item) => item.trim())
        .filter(Boolean),
    [images],
  );

  function closeViewer() {
    setActiveIndex(null);
  }

  function showPrevious() {
    setActiveIndex((current) => {
      if (current === null) {
        return current;
      }
      return cycleIndex(current, validImages.length, -1);
    });
  }

  function showNext() {
    setActiveIndex((current) => {
      if (current === null) {
        return current;
      }
      return cycleIndex(current, validImages.length, 1);
    });
  }

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    if (activeIndex === null) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeViewer();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPrevious();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showNext();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [activeIndex, validImages.length]);

  if (validImages.length === 0) {
    return null;
  }

  const viewer =
    activeIndex !== null ? (
      <div className="image-viewer" role="dialog" aria-modal="true" onClick={closeViewer}>
        <div className="image-viewer__surface" onClick={(event) => event.stopPropagation()}>
          <header className="image-viewer__header">
            <p className="image-viewer__counter">
              {activeIndex + 1} / {validImages.length}
            </p>
            <button
              type="button"
              className="image-viewer__icon image-viewer__close"
              onClick={closeViewer}
              aria-label="Close image viewer"
            >
              ×
            </button>
          </header>

          <div className="image-viewer__stage">
            {validImages.length > 1 ? (
              <button
                type="button"
                className="image-viewer__icon image-viewer__nav"
                onClick={showPrevious}
                aria-label="Previous image"
              >
                ‹
              </button>
            ) : null}

            <figure className="image-viewer__frame">
              <img src={validImages[activeIndex]} alt={`${altBase} ${activeIndex + 1}`} />
            </figure>

            {validImages.length > 1 ? (
              <button
                type="button"
                className="image-viewer__icon image-viewer__nav"
                onClick={showNext}
                aria-label="Next image"
              >
                ›
              </button>
            ) : null}
          </div>

          {validImages.length > 1 ? (
            <div className="image-viewer__thumbs" aria-label="Image thumbnails">
              {validImages.map((url, index) => (
                <button
                  key={`${url}-${index}-viewer`}
                  type="button"
                  className={`image-viewer__thumb${index === activeIndex ? " is-active" : ""}`}
                  onClick={() => setActiveIndex(index)}
                >
                  <img src={url} alt={`${altBase} ${index + 1}`} loading="lazy" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    ) : null;

  return (
    <>
      <div
        className={`image-gallery image-gallery--${variant}`}
        aria-label={ariaLabel}
      >
        {validImages.map((url, index) => (
          <div key={`${url}-${index}`} className="image-gallery__item">
            <button
              type="button"
              className="image-gallery__thumb"
              onClick={() => setActiveIndex(index)}
            >
              <img src={url} alt={`${altBase} ${index + 1}`} loading="lazy" />
            </button>
            {onRemoveImage ? (
              <button
                type="button"
                className="image-gallery__remove"
                onClick={() => onRemoveImage(index)}
              >
                {removeLabel || "Remove"}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {isMounted && viewer ? createPortal(viewer, document.body) : null}
    </>
  );
}
