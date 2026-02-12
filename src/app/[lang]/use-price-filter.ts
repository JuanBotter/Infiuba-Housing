"use client";

import { useMemo, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { Listing } from "@/types";

type OverlapDragMode = "none" | "moveMin" | "moveMax";

export function clampToRange(value: number, minValue: number, maxValue: number) {
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}

interface UsePriceFilterOptions {
  listings: Listing[];
  priceMin: string;
  setPriceMin: Dispatch<SetStateAction<string>>;
  priceMax: string;
  setPriceMax: Dispatch<SetStateAction<string>>;
}

export function usePriceFilter({
  listings,
  priceMin,
  setPriceMin,
  priceMax,
  setPriceMax,
}: UsePriceFilterOptions) {
  const overlapDragModeRef = useRef<OverlapDragMode>("none");
  const overlapDragAnchorRef = useRef<number | null>(null);

  const priceBounds = useMemo(() => {
    const allReviewPrices: number[] = [];
    let minPrice = Number.POSITIVE_INFINITY;
    let maxPrice = Number.NEGATIVE_INFINITY;

    for (const listing of listings) {
      for (const rawPrice of listing.reviewPrices || []) {
        if (!Number.isFinite(rawPrice)) {
          continue;
        }
        allReviewPrices.push(rawPrice);
        minPrice = Math.min(minPrice, rawPrice);
        maxPrice = Math.max(maxPrice, rawPrice);
      }
    }

    if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
      return null;
    }

    const min = Math.floor(minPrice);
    const max = Math.ceil(maxPrice);
    const hasPriceAtLowerBound = allReviewPrices.some((price) => Math.abs(price - min) < 0.000001);

    return {
      min,
      max,
      hasPriceAtLowerBound,
    };
  }, [listings]);

  const priceSliderStep = 1;
  const priceMinNoFilterValue = useMemo(() => {
    if (!priceBounds) {
      return 0;
    }
    return priceBounds.hasPriceAtLowerBound
      ? priceBounds.min
      : priceBounds.min + priceSliderStep;
  }, [priceBounds]);

  const effectivePriceRange = useMemo(() => {
    if (!priceBounds) {
      return {
        sliderMin: 0,
        sliderMax: 0,
        hasMin: false,
        hasMax: false,
        minFilter: undefined as number | undefined,
        maxFilter: undefined as number | undefined,
      };
    }

    const parsedMin = Number(priceMin);
    const parsedMax = Number(priceMax);
    const hasStoredMin = priceMin !== "" && Number.isFinite(parsedMin);
    const hasStoredMax = priceMax !== "" && Number.isFinite(parsedMax);
    let sliderMin = hasStoredMin
      ? clampToRange(Math.round(parsedMin), priceBounds.min, priceBounds.max)
      : priceBounds.min;
    let sliderMax = hasStoredMax
      ? clampToRange(Math.round(parsedMax), priceBounds.min, priceBounds.max)
      : priceBounds.max;

    if (sliderMin > sliderMax) {
      [sliderMin, sliderMax] = [sliderMax, sliderMin];
    }

    const hasMin = sliderMin > priceMinNoFilterValue;
    const hasMax = sliderMax < priceBounds.max;

    return {
      sliderMin,
      sliderMax,
      hasMin,
      hasMax,
      minFilter: hasMin ? sliderMin : undefined,
      maxFilter: hasMax ? sliderMax : undefined,
    };
  }, [priceBounds, priceMax, priceMin, priceMinNoFilterValue]);

  const priceRangePercents = useMemo(() => {
    if (!priceBounds) {
      return {
        start: 0,
        end: 100,
      };
    }

    const rangeSpan = Math.max(priceBounds.max - priceBounds.min, 1);
    const startPercent = ((effectivePriceRange.sliderMin - priceBounds.min) / rangeSpan) * 100;
    const endPercent = ((effectivePriceRange.sliderMax - priceBounds.min) / rangeSpan) * 100;

    return {
      start: startPercent,
      end: endPercent,
    };
  }, [effectivePriceRange.sliderMax, effectivePriceRange.sliderMin, priceBounds]);

  const priceHistogram = useMemo(() => {
    type HistogramBar = { id: number; heightPercent: number; isActive: boolean };
    if (!priceBounds) {
      return [] as HistogramBar[];
    }

    const allReviewPrices: number[] = [];
    for (const listing of listings) {
      for (const rawPrice of listing.reviewPrices || []) {
        if (!Number.isFinite(rawPrice)) {
          continue;
        }
        allReviewPrices.push(rawPrice);
      }
    }

    if (allReviewPrices.length === 0) {
      return [] as HistogramBar[];
    }

    const binCount = Math.min(28, Math.max(10, Math.round(Math.sqrt(allReviewPrices.length) * 1.8)));
    const counts = Array.from({ length: binCount }, () => 0);
    const rangeSpan = Math.max(priceBounds.max - priceBounds.min, 1);

    for (const price of allReviewPrices) {
      const normalized = (price - priceBounds.min) / rangeSpan;
      const binIndex = Math.min(binCount - 1, Math.max(0, Math.floor(normalized * binCount)));
      counts[binIndex] += 1;
    }

    const maxBinCount = Math.max(...counts);
    if (maxBinCount <= 0) {
      return [] as HistogramBar[];
    }

    return counts.map((count, index) => {
      const centerPercent = ((index + 0.5) / binCount) * 100;
      return {
        id: index,
        heightPercent: count > 0 ? Math.max(14, Math.round((count / maxBinCount) * 100)) : 0,
        isActive:
          centerPercent >= priceRangePercents.start && centerPercent <= priceRangePercents.end,
      };
    });
  }, [listings, priceBounds, priceRangePercents.end, priceRangePercents.start]);

  function startPriceSliderDrag() {
    if (effectivePriceRange.sliderMin === effectivePriceRange.sliderMax) {
      overlapDragAnchorRef.current = effectivePriceRange.sliderMin;
      overlapDragModeRef.current = "none";
      return;
    }
    overlapDragAnchorRef.current = null;
    overlapDragModeRef.current = "none";
  }

  function endPriceSliderDrag() {
    overlapDragAnchorRef.current = null;
    overlapDragModeRef.current = "none";
  }

  function applyOverlapAwarePriceChange(nextValue: number) {
    if (!priceBounds) {
      return false;
    }

    const anchorValue = overlapDragAnchorRef.current;
    if (anchorValue === null) {
      return false;
    }

    let mode = overlapDragModeRef.current;
    if (mode === "none") {
      if (nextValue < anchorValue) {
        mode = "moveMin";
      } else if (nextValue > anchorValue) {
        mode = "moveMax";
      } else {
        return true;
      }
      overlapDragModeRef.current = mode;
    }

    if (mode === "moveMin") {
      const boundedValue = Math.min(nextValue, anchorValue);
      setPriceMin(boundedValue <= priceMinNoFilterValue ? "" : String(boundedValue));
      setPriceMax(anchorValue >= priceBounds.max ? "" : String(anchorValue));
      return true;
    }

    const boundedValue = Math.max(nextValue, anchorValue);
    setPriceMax(boundedValue >= priceBounds.max ? "" : String(boundedValue));
    setPriceMin(anchorValue <= priceMinNoFilterValue ? "" : String(anchorValue));
    return true;
  }

  function handleMinPriceSliderChange(nextValueRaw: number) {
    if (!priceBounds) {
      return;
    }
    const nextValue = clampToRange(Math.round(nextValueRaw), priceBounds.min, priceBounds.max);
    if (applyOverlapAwarePriceChange(nextValue)) {
      return;
    }

    const { sliderMax } = effectivePriceRange;
    const boundedValue = Math.min(nextValue, sliderMax);
    setPriceMin(boundedValue <= priceMinNoFilterValue ? "" : String(boundedValue));
  }

  function handleMaxPriceSliderChange(nextValueRaw: number) {
    if (!priceBounds) {
      return;
    }
    const nextValue = clampToRange(Math.round(nextValueRaw), priceBounds.min, priceBounds.max);
    if (applyOverlapAwarePriceChange(nextValue)) {
      return;
    }

    const { sliderMin } = effectivePriceRange;
    const boundedValue = Math.max(nextValue, sliderMin);
    setPriceMax(boundedValue >= priceBounds.max ? "" : String(boundedValue));
  }

  return {
    priceBounds,
    priceSliderStep,
    effectivePriceRange,
    priceRangePercents,
    priceHistogram,
    startPriceSliderDrag,
    endPriceSliderDrag,
    handleMinPriceSliderChange,
    handleMaxPriceSliderChange,
  };
}
