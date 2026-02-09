"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";

interface ImageGalleryViewerProps {
  images: string[];
  altBase: string;
  ariaLabel?: string;
  variant?: "default" | "property";
  onRemoveImage?: (index: number) => void;
  removeLabel?: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.2;
const SWIPE_THRESHOLD_PX = 48;

function cycleIndex(current: number, total: number, delta: number) {
  return (current + delta + total) % total;
}

function clampZoom(value: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value.toFixed(2))));
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
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  const [zoomLevel, setZoomLevel] = useState(MIN_ZOOM);
  const [loadedImages, setLoadedImages] = useState<Record<string, true>>({});
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const validImages = useMemo(
    () =>
      images
        .map((item) => item.trim())
        .filter(Boolean),
    [images],
  );

  const canNavigate = validImages.length > 1;
  const activeUrl = activeIndex === null ? null : validImages[activeIndex] ?? null;
  const activeImageLoaded = activeUrl ? Boolean(loadedImages[activeUrl]) : false;

  function markImageLoaded(url: string | null) {
    if (!url) {
      return;
    }
    setLoadedImages((previous) => (previous[url] ? previous : { ...previous, [url]: true }));
  }

  function closeViewer() {
    setActiveIndex(null);
  }

  function openViewerAt(index: number) {
    setActiveIndex(index);
    setFitMode("contain");
    setZoomLevel(MIN_ZOOM);
  }

  function showPrevious() {
    if (!canNavigate) {
      return;
    }
    setActiveIndex((current) => {
      if (current === null) {
        return current;
      }
      return cycleIndex(current, validImages.length, -1);
    });
  }

  function showNext() {
    if (!canNavigate) {
      return;
    }
    setActiveIndex((current) => {
      if (current === null) {
        return current;
      }
      return cycleIndex(current, validImages.length, 1);
    });
  }

  function adjustZoom(delta: number) {
    setZoomLevel((current) => clampZoom(current + delta));
  }

  function resetZoom() {
    setZoomLevel(MIN_ZOOM);
  }

  function toggleFitMode() {
    setFitMode((current) => (current === "cover" ? "contain" : "cover"));
  }

  function handleStageTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 1) {
      touchStartRef.current = null;
      return;
    }
    touchStartRef.current = {
      x: event.touches[0]?.clientX ?? 0,
      y: event.touches[0]?.clientY ?? 0,
    };
  }

  function handleStageTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    if (!canNavigate || !touchStartRef.current || event.changedTouches.length !== 1) {
      touchStartRef.current = null;
      return;
    }

    const endX = event.changedTouches[0]?.clientX ?? 0;
    const endY = event.changedTouches[0]?.clientY ?? 0;
    const deltaX = endX - touchStartRef.current.x;
    const deltaY = endY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) {
      return;
    }

    if (deltaX > 0) {
      showPrevious();
      return;
    }
    showNext();
  }

  function handleStageWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (activeIndex === null) {
      return;
    }
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
      return;
    }

    event.preventDefault();
    adjustZoom(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
  }

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    if (activeIndex === null) {
      return;
    }
    if (validImages.length === 0) {
      setActiveIndex(null);
      return;
    }
    if (activeIndex >= validImages.length) {
      setActiveIndex(validImages.length - 1);
    }
  }, [activeIndex, validImages.length]);

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
        if (canNavigate) {
          setActiveIndex((current) => {
            if (current === null) {
              return current;
            }
            return cycleIndex(current, validImages.length, -1);
          });
        }
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (canNavigate) {
          setActiveIndex((current) => {
            if (current === null) {
              return current;
            }
            return cycleIndex(current, validImages.length, 1);
          });
        }
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(validImages.length - 1);
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoomLevel((current) => clampZoom(current + ZOOM_STEP));
        return;
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setZoomLevel((current) => clampZoom(current - ZOOM_STEP));
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        setZoomLevel(MIN_ZOOM);
        return;
      }
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        setFitMode((current) => (current === "cover" ? "contain" : "cover"));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [activeIndex, canNavigate, validImages.length]);

  useEffect(() => {
    if (activeIndex === null || validImages.length === 0) {
      return;
    }

    setZoomLevel(MIN_ZOOM);

    const adjacent = [
      validImages[activeIndex],
      validImages[cycleIndex(activeIndex, validImages.length, -1)],
      validImages[cycleIndex(activeIndex, validImages.length, 1)],
    ].filter(Boolean);

    for (const url of adjacent) {
      if (!url || loadedImages[url]) {
        continue;
      }
      const image = new Image();
      image.src = url;
    }
  }, [activeIndex, loadedImages, validImages]);

  if (validImages.length === 0) {
    return null;
  }

  const viewer =
    activeIndex !== null && activeUrl ? (
      <div className="image-viewer" role="dialog" aria-modal="true" onClick={closeViewer}>
        <div className="image-viewer__surface" onClick={(event) => event.stopPropagation()}>
          <header className="image-viewer__header">
            <p className="image-viewer__counter">
              {activeIndex + 1} / {validImages.length}
            </p>
            <div className="image-viewer__actions">
              <button
                type="button"
                className="image-viewer__action image-viewer__action--toggle"
                onClick={toggleFitMode}
                aria-label="Toggle fit mode"
                title={fitMode === "contain" ? "Fill frame (F)" : "Fit image (F)"}
              >
                {fitMode === "contain" ? "Fill" : "Fit"}
              </button>
              <button
                type="button"
                className="image-viewer__action"
                onClick={() => adjustZoom(-ZOOM_STEP)}
                aria-label="Zoom out"
                title="Zoom out (-)"
                disabled={zoomLevel <= MIN_ZOOM}
              >
                -
              </button>
              <button
                type="button"
                className="image-viewer__action image-viewer__action--zoom"
                onClick={resetZoom}
                aria-label="Reset zoom"
                title="Reset zoom (0)"
                disabled={zoomLevel === MIN_ZOOM}
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                type="button"
                className="image-viewer__action"
                onClick={() => adjustZoom(ZOOM_STEP)}
                aria-label="Zoom in"
                title="Zoom in (+)"
                disabled={zoomLevel >= MAX_ZOOM}
              >
                +
              </button>
              <a
                className="image-viewer__action image-viewer__action--link"
                href={activeUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open original image"
                title="Open original image in new tab"
              >
                Open
              </a>
              <button
                type="button"
                className="image-viewer__icon image-viewer__close"
                onClick={closeViewer}
                aria-label="Close image viewer"
                title="Close (Esc)"
              >
                ×
              </button>
            </div>
          </header>

          <div
            className="image-viewer__stage"
            onTouchStart={handleStageTouchStart}
            onTouchEnd={handleStageTouchEnd}
            onWheel={handleStageWheel}
          >
            {canNavigate ? (
              <button
                type="button"
                className="image-viewer__icon image-viewer__nav"
                onClick={showPrevious}
                aria-label="Previous image"
                title="Previous image (Left arrow)"
              >
                ‹
              </button>
            ) : (
              <span className="image-viewer__nav-spacer" aria-hidden="true" />
            )}

            <figure
              className={`image-viewer__frame${fitMode === "contain" ? " is-fit" : " is-fill"}`}
              onDoubleClick={() =>
                setZoomLevel((current) => (current > MIN_ZOOM ? MIN_ZOOM : clampZoom(2)))
              }
            >
              {!activeImageLoaded ? <div className="image-viewer__loading" /> : null}
              <img
                key={activeUrl}
                className="image-viewer__image"
                src={activeUrl}
                alt={`${altBase} ${activeIndex + 1}`}
                style={{ transform: `scale(${zoomLevel})` }}
                onLoad={() => markImageLoaded(activeUrl)}
                draggable={false}
              />
            </figure>

            {canNavigate ? (
              <button
                type="button"
                className="image-viewer__icon image-viewer__nav"
                onClick={showNext}
                aria-label="Next image"
                title="Next image (Right arrow)"
              >
                ›
              </button>
            ) : (
              <span className="image-viewer__nav-spacer" aria-hidden="true" />
            )}
          </div>

          {canNavigate ? (
            <div className="image-viewer__thumbs" aria-label="Image thumbnails">
              {validImages.map((url, index) => (
                <button
                  key={`${url}-${index}-viewer`}
                  type="button"
                  className={`image-viewer__thumb${index === activeIndex ? " is-active" : ""}`}
                  onClick={() => {
                    setActiveIndex(index);
                    setZoomLevel(MIN_ZOOM);
                  }}
                  aria-label={`View image ${index + 1}`}
                >
                  <img
                    src={url}
                    alt={`${altBase} ${index + 1}`}
                    loading="lazy"
                    onLoad={() => markImageLoaded(url)}
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    ) : null;

  return (
    <>
      <div className={`image-gallery image-gallery--${variant}`} aria-label={ariaLabel}>
        {validImages.map((url, index) => (
          <div key={`${url}-${index}`} className="image-gallery__item">
            <button type="button" className="image-gallery__thumb" onClick={() => openViewerAt(index)}>
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
