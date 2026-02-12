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

import type { Lang } from "@/types";

interface ImageGalleryViewerProps {
  lang: Lang;
  images: string[];
  altBase: string;
  ariaLabel?: string;
  variant?: "default" | "property";
  onRemoveImage?: (index: number) => void;
  removeLabel?: string;
}

interface ViewerText {
  toggleFitModeAria: string;
  fillFrameTitle: string;
  fitImageTitle: string;
  fillButton: string;
  fitButton: string;
  zoomOutAria: string;
  zoomOutTitle: string;
  resetZoomAria: string;
  resetZoomTitle: string;
  zoomInAria: string;
  zoomInTitle: string;
  openOriginalAria: string;
  openOriginalTitle: string;
  openButton: string;
  closeAria: string;
  closeTitle: string;
  previousAria: string;
  previousTitle: string;
  nextAria: string;
  nextTitle: string;
  thumbnailsAria: string;
  viewImageAriaPrefix: string;
  removeButton: string;
}

const viewerTextByLang: Record<Lang, ViewerText> = {
  en: {
    toggleFitModeAria: "Toggle fit mode",
    fillFrameTitle: "Fill frame (F)",
    fitImageTitle: "Fit image (F)",
    fillButton: "Fill",
    fitButton: "Fit",
    zoomOutAria: "Zoom out",
    zoomOutTitle: "Zoom out (-)",
    resetZoomAria: "Reset zoom",
    resetZoomTitle: "Reset zoom (0)",
    zoomInAria: "Zoom in",
    zoomInTitle: "Zoom in (+)",
    openOriginalAria: "Open original image",
    openOriginalTitle: "Open original image in new tab",
    openButton: "Open",
    closeAria: "Close image viewer",
    closeTitle: "Close (Esc)",
    previousAria: "Previous image",
    previousTitle: "Previous image (Left arrow)",
    nextAria: "Next image",
    nextTitle: "Next image (Right arrow)",
    thumbnailsAria: "Image thumbnails",
    viewImageAriaPrefix: "View image",
    removeButton: "Remove",
  },
  es: {
    toggleFitModeAria: "Cambiar modo de ajuste",
    fillFrameTitle: "Llenar marco (F)",
    fitImageTitle: "Ajustar imagen (F)",
    fillButton: "Llenar",
    fitButton: "Ajustar",
    zoomOutAria: "Alejar",
    zoomOutTitle: "Alejar (-)",
    resetZoomAria: "Restablecer zoom",
    resetZoomTitle: "Restablecer zoom (0)",
    zoomInAria: "Acercar",
    zoomInTitle: "Acercar (+)",
    openOriginalAria: "Abrir imagen original",
    openOriginalTitle: "Abrir imagen original en una pestaña nueva",
    openButton: "Abrir",
    closeAria: "Cerrar visor de imágenes",
    closeTitle: "Cerrar (Esc)",
    previousAria: "Imagen anterior",
    previousTitle: "Imagen anterior (Flecha izquierda)",
    nextAria: "Imagen siguiente",
    nextTitle: "Imagen siguiente (Flecha derecha)",
    thumbnailsAria: "Miniaturas de imágenes",
    viewImageAriaPrefix: "Ver imagen",
    removeButton: "Quitar",
  },
  fr: {
    toggleFitModeAria: "Changer le mode d'ajustement",
    fillFrameTitle: "Remplir le cadre (F)",
    fitImageTitle: "Ajuster l'image (F)",
    fillButton: "Remplir",
    fitButton: "Ajuster",
    zoomOutAria: "Zoom arrière",
    zoomOutTitle: "Zoom arrière (-)",
    resetZoomAria: "Réinitialiser le zoom",
    resetZoomTitle: "Réinitialiser le zoom (0)",
    zoomInAria: "Zoom avant",
    zoomInTitle: "Zoom avant (+)",
    openOriginalAria: "Ouvrir l'image originale",
    openOriginalTitle: "Ouvrir l'image originale dans un nouvel onglet",
    openButton: "Ouvrir",
    closeAria: "Fermer la visionneuse d'images",
    closeTitle: "Fermer (Esc)",
    previousAria: "Image précédente",
    previousTitle: "Image précédente (Flèche gauche)",
    nextAria: "Image suivante",
    nextTitle: "Image suivante (Flèche droite)",
    thumbnailsAria: "Vignettes des images",
    viewImageAriaPrefix: "Voir l'image",
    removeButton: "Retirer",
  },
  de: {
    toggleFitModeAria: "Anpassungsmodus umschalten",
    fillFrameTitle: "Rahmen füllen (F)",
    fitImageTitle: "Bild einpassen (F)",
    fillButton: "Füllen",
    fitButton: "Einpassen",
    zoomOutAria: "Verkleinern",
    zoomOutTitle: "Verkleinern (-)",
    resetZoomAria: "Zoom zurücksetzen",
    resetZoomTitle: "Zoom zurücksetzen (0)",
    zoomInAria: "Vergrößern",
    zoomInTitle: "Vergrößern (+)",
    openOriginalAria: "Originalbild öffnen",
    openOriginalTitle: "Originalbild in neuem Tab öffnen",
    openButton: "Öffnen",
    closeAria: "Bildansicht schließen",
    closeTitle: "Schließen (Esc)",
    previousAria: "Vorheriges Bild",
    previousTitle: "Vorheriges Bild (Pfeil links)",
    nextAria: "Nächstes Bild",
    nextTitle: "Nächstes Bild (Pfeil rechts)",
    thumbnailsAria: "Bild-Miniaturen",
    viewImageAriaPrefix: "Bild anzeigen",
    removeButton: "Entfernen",
  },
  pt: {
    toggleFitModeAria: "Alternar modo de ajuste",
    fillFrameTitle: "Preencher moldura (F)",
    fitImageTitle: "Ajustar imagem (F)",
    fillButton: "Preencher",
    fitButton: "Ajustar",
    zoomOutAria: "Diminuir zoom",
    zoomOutTitle: "Diminuir zoom (-)",
    resetZoomAria: "Redefinir zoom",
    resetZoomTitle: "Redefinir zoom (0)",
    zoomInAria: "Aumentar zoom",
    zoomInTitle: "Aumentar zoom (+)",
    openOriginalAria: "Abrir imagem original",
    openOriginalTitle: "Abrir imagem original em nova aba",
    openButton: "Abrir",
    closeAria: "Fechar visualizador de imagens",
    closeTitle: "Fechar (Esc)",
    previousAria: "Imagem anterior",
    previousTitle: "Imagem anterior (Seta esquerda)",
    nextAria: "Próxima imagem",
    nextTitle: "Próxima imagem (Seta direita)",
    thumbnailsAria: "Miniaturas das imagens",
    viewImageAriaPrefix: "Ver imagem",
    removeButton: "Remover",
  },
  it: {
    toggleFitModeAria: "Cambia modalità di adattamento",
    fillFrameTitle: "Riempi riquadro (F)",
    fitImageTitle: "Adatta immagine (F)",
    fillButton: "Riempi",
    fitButton: "Adatta",
    zoomOutAria: "Riduci zoom",
    zoomOutTitle: "Riduci zoom (-)",
    resetZoomAria: "Reimposta zoom",
    resetZoomTitle: "Reimposta zoom (0)",
    zoomInAria: "Aumenta zoom",
    zoomInTitle: "Aumenta zoom (+)",
    openOriginalAria: "Apri immagine originale",
    openOriginalTitle: "Apri immagine originale in una nuova scheda",
    openButton: "Apri",
    closeAria: "Chiudi visualizzatore immagini",
    closeTitle: "Chiudi (Esc)",
    previousAria: "Immagine precedente",
    previousTitle: "Immagine precedente (Freccia sinistra)",
    nextAria: "Immagine successiva",
    nextTitle: "Immagine successiva (Freccia destra)",
    thumbnailsAria: "Miniature immagini",
    viewImageAriaPrefix: "Vedi immagine",
    removeButton: "Rimuovi",
  },
  no: {
    toggleFitModeAria: "Bytt tilpasningsmodus",
    fillFrameTitle: "Fyll ramme (F)",
    fitImageTitle: "Tilpass bilde (F)",
    fillButton: "Fyll",
    fitButton: "Tilpass",
    zoomOutAria: "Zoom ut",
    zoomOutTitle: "Zoom ut (-)",
    resetZoomAria: "Tilbakestill zoom",
    resetZoomTitle: "Tilbakestill zoom (0)",
    zoomInAria: "Zoom inn",
    zoomInTitle: "Zoom inn (+)",
    openOriginalAria: "Åpne originalbilde",
    openOriginalTitle: "Åpne originalbilde i ny fane",
    openButton: "Åpne",
    closeAria: "Lukk bildeviser",
    closeTitle: "Lukk (Esc)",
    previousAria: "Forrige bilde",
    previousTitle: "Forrige bilde (Venstre pil)",
    nextAria: "Neste bilde",
    nextTitle: "Neste bilde (Høyre pil)",
    thumbnailsAria: "Bilde-miniatyrer",
    viewImageAriaPrefix: "Vis bilde",
    removeButton: "Fjern",
  },
};

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

function getZoomStepIndex(zoomLevel: number) {
  const stepIndex = Math.round((zoomLevel - MIN_ZOOM) / ZOOM_STEP);
  return Math.max(0, Math.min(10, stepIndex));
}

export function ImageGalleryViewer({
  lang,
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
  const zoomClassName = `is-zoom-${getZoomStepIndex(zoomLevel)}`;
  const text = viewerTextByLang[lang];

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
                aria-label={text.toggleFitModeAria}
                title={fitMode === "contain" ? text.fillFrameTitle : text.fitImageTitle}
              >
                {fitMode === "contain" ? text.fillButton : text.fitButton}
              </button>
              <button
                type="button"
                className="image-viewer__action"
                onClick={() => adjustZoom(-ZOOM_STEP)}
                aria-label={text.zoomOutAria}
                title={text.zoomOutTitle}
                disabled={zoomLevel <= MIN_ZOOM}
              >
                -
              </button>
              <button
                type="button"
                className="image-viewer__action image-viewer__action--zoom"
                onClick={resetZoom}
                aria-label={text.resetZoomAria}
                title={text.resetZoomTitle}
                disabled={zoomLevel === MIN_ZOOM}
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                type="button"
                className="image-viewer__action"
                onClick={() => adjustZoom(ZOOM_STEP)}
                aria-label={text.zoomInAria}
                title={text.zoomInTitle}
                disabled={zoomLevel >= MAX_ZOOM}
              >
                +
              </button>
              <a
                className="image-viewer__action image-viewer__action--link"
                href={activeUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={text.openOriginalAria}
                title={text.openOriginalTitle}
              >
                {text.openButton}
              </a>
              <button
                type="button"
                className="image-viewer__icon image-viewer__close"
                onClick={closeViewer}
                aria-label={text.closeAria}
                title={text.closeTitle}
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
                aria-label={text.previousAria}
                title={text.previousTitle}
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
                className={`image-viewer__image ${zoomClassName}`}
                src={activeUrl}
                alt={`${altBase} ${activeIndex + 1}`}
                onLoad={() => markImageLoaded(activeUrl)}
                draggable={false}
              />
            </figure>

            {canNavigate ? (
              <button
                type="button"
                className="image-viewer__icon image-viewer__nav"
                onClick={showNext}
                aria-label={text.nextAria}
                title={text.nextTitle}
              >
                ›
              </button>
            ) : (
              <span className="image-viewer__nav-spacer" aria-hidden="true" />
            )}
          </div>

          {canNavigate ? (
            <div className="image-viewer__thumbs" aria-label={text.thumbnailsAria}>
              {validImages.map((url, index) => (
                <button
                  key={`${url}-${index}-viewer`}
                  type="button"
                  className={`image-viewer__thumb${index === activeIndex ? " is-active" : ""}`}
                  onClick={() => {
                    setActiveIndex(index);
                    setZoomLevel(MIN_ZOOM);
                  }}
                  aria-label={`${text.viewImageAriaPrefix} ${index + 1}`}
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
                {removeLabel || text.removeButton}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {isMounted && viewer ? createPortal(viewer, document.body) : null}
    </>
  );
}
