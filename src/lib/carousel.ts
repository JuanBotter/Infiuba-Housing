function mod(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

export function normalizeCarouselIndex(index: number | undefined, length: number) {
  if (!Number.isInteger(length) || length <= 0) {
    return 0;
  }

  if (typeof index !== "number" || !Number.isInteger(index)) {
    return 0;
  }

  return mod(index, length);
}

export function cycleCarouselIndex(index: number | undefined, length: number, step: number) {
  if (!Number.isInteger(length) || length <= 0) {
    return 0;
  }

  if (typeof step !== "number" || !Number.isInteger(step)) {
    return normalizeCarouselIndex(index, length);
  }

  const baseIndex = normalizeCarouselIndex(index, length);
  return mod(baseIndex + step, length);
}
