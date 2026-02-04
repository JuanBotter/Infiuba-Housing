import datasetJson from "@/data/accommodations.json";
import type { Dataset, Listing } from "@/types";

const dataset = datasetJson as Dataset;

export function getListings() {
  return dataset.listings;
}

export function getListingById(id: string): Listing | undefined {
  return dataset.listings.find((listing) => listing.id === id);
}

export function getNeighborhoods() {
  return [...new Set(dataset.listings.map((listing) => listing.neighborhood))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );
}

export function getDatasetMeta() {
  return {
    generatedAt: dataset.generatedAt,
    sourceFile: dataset.sourceFile,
    totalListings: dataset.totalListings,
  };
}
