import assert from "node:assert/strict";
import test from "node:test";

import {
  assignStableSurveyReviewIds,
  parseNumber,
} from "./build-dataset.mjs";

test("parseNumber supports localized and USD values", () => {
  assert.equal(parseNumber("1.234,50"), 1234.5);
  assert.equal(parseNumber("USD 980"), 980);
  assert.equal(parseNumber(""), undefined);
});

test("assignStableSurveyReviewIds is deterministic regardless of input order", () => {
  const listingId = "palermo-sample-abc123";
  const draftReviews = [
    {
      year: 2024,
      rating: 5,
      priceUsd: 950,
      recommended: true,
      comment: "Great place near campus",
      studentContact: "first@example.com",
      createdAt: "2024-01-01T00:00:00.000Z",
    },
    {
      year: 2023,
      rating: 4,
      priceUsd: 1100,
      recommended: false,
      comment: "Okay but noisy",
      studentContact: "second@example.com",
      createdAt: "2023-01-01T00:00:00.000Z",
    },
  ];

  const idsA = assignStableSurveyReviewIds(listingId, draftReviews).map((review) => review.id);
  const idsB = assignStableSurveyReviewIds(listingId, [...draftReviews].reverse()).map(
    (review) => review.id,
  );

  assert.deepEqual(idsA, idsB);
});

test("assignStableSurveyReviewIds disambiguates duplicate rows", () => {
  const listingId = "balvanera-sample-def456";
  const duplicates = [
    {
      year: 2022,
      rating: 4,
      priceUsd: 780,
      recommended: true,
      comment: "Same review body",
      studentContact: "",
      createdAt: "2022-01-01T00:00:00.000Z",
    },
    {
      year: 2022,
      rating: 4,
      priceUsd: 780,
      recommended: true,
      comment: "Same review body",
      studentContact: "",
      createdAt: "2022-01-01T00:00:00.000Z",
    },
  ];

  const ids = assignStableSurveyReviewIds(listingId, duplicates).map((review) => review.id);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
  assert.match(ids[1], /-2$/);
});
