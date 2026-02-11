"use client";

import { useEffect, type RefObject } from "react";

interface DetailsLike {
  hasAttribute(name: string): boolean;
  contains(target: unknown): boolean;
  removeAttribute(name: string): void;
}

function isNodeLike(value: unknown) {
  return typeof value === "object" && value !== null && "nodeType" in value;
}

export function shouldCloseDetailsOnPointerDown(
  details: Pick<DetailsLike, "hasAttribute" | "contains"> | null,
  target: unknown,
) {
  if (!details || !details.hasAttribute("open")) {
    return false;
  }
  if (!isNodeLike(target)) {
    return false;
  }
  return !details.contains(target);
}

export function useDetailsOutsideClose(detailsRef: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (!details) {
        return;
      }
      if (!shouldCloseDetailsOnPointerDown(details, event.target)) {
        return;
      }
      details.removeAttribute("open");
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [detailsRef]);
}
