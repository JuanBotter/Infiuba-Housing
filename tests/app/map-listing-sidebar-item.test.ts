import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MapListingSidebarItem } from "@/app/[lang]/map-listing-sidebar-item";
import { messages } from "@/i18n/messages";
import type { Listing } from "@/types";

vi.mock("next/link", () => ({
  default: (props: { href: string; className?: string; children: React.ReactNode }) =>
    React.createElement("a", { href: props.href, className: props.className }, props.children),
}));

function baseListing(): Listing {
  return {
    id: "listing-1",
    address: "Av Caseros 787",
    neighborhood: "San Telmo",
    contacts: [],
    totalReviews: 4,
    reviews: [],
    imageUrls: [],
  };
}

describe("MapListingSidebarItem", () => {
  it("renders media carousel controls for listings with images", () => {
    const listing = baseListing();
    listing.imageUrls = ["https://example.com/one.jpg", "https://example.com/two.jpg"];

    const markup = renderToStaticMarkup(
      React.createElement(MapListingSidebarItem, {
        lang: "en",
        listing,
        messages: messages.en,
        isSelected: false,
        isFavorite: false,
        isFavoritePending: false,
        favoriteAriaLabel: messages.en.favoriteAdd,
        registerRef: () => {},
        onSelect: () => {},
        onToggleFavorite: () => {},
      }),
    );

    expect(markup).toContain("map-listing__media-counter");
    expect(markup).toContain(">1 / 2<");
    expect(markup).toContain("map-listing__media-nav map-listing__media-nav--prev");
    expect(markup).toContain("map-listing__media-nav map-listing__media-nav--next");
  });

  it("renders disabled media arrows when listing has one image", () => {
    const listing = baseListing();
    listing.imageUrls = ["https://example.com/one.jpg"];

    const markup = renderToStaticMarkup(
      React.createElement(MapListingSidebarItem, {
        lang: "en",
        listing,
        messages: messages.en,
        isSelected: false,
        isFavorite: false,
        isFavoritePending: false,
        favoriteAriaLabel: messages.en.favoriteAdd,
        registerRef: () => {},
        onSelect: () => {},
        onToggleFavorite: () => {},
      }),
    );

    expect(markup).toMatch(/map-listing__media-nav map-listing__media-nav--prev[^>]*disabled/);
    expect(markup).toMatch(/map-listing__media-nav map-listing__media-nav--next[^>]*disabled/);
  });
});
