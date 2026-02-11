import type { Review } from "@/types";

function parseYearFromSemester(semester: string | undefined) {
  if (!semester) {
    return undefined;
  }

  const normalized = semester.trim();
  const match = normalized.match(/(?:^|\D)(\d{4})(?:\D|$)/);
  if (!match) {
    return undefined;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseYearFromCreatedAt(createdAt: string) {
  const parsedDate = new Date(createdAt);
  if (Number.isNaN(parsedDate.getTime())) {
    return undefined;
  }

  const year = parsedDate.getUTCFullYear();
  return Number.isFinite(year) ? year : undefined;
}

export function getReviewDisplayYear(
  review: Pick<Review, "year" | "semester" | "createdAt">,
) {
  if (typeof review.year === "number" && Number.isFinite(review.year)) {
    return review.year;
  }

  const semesterYear = parseYearFromSemester(review.semester);
  if (typeof semesterYear === "number") {
    return semesterYear;
  }

  return parseYearFromCreatedAt(review.createdAt);
}
