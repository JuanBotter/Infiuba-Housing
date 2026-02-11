"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";

import type { Messages } from "@/i18n/messages";
import { getListingPoints } from "@/lib/map-points";
import type { Listing } from "@/types";

interface ListingsMapProps {
  messages: Pick<Messages, "reviewsLabel">;
  listings: Listing[];
  selectedListingId: string | null;
  onSelectListing: (listingId: string) => void;
}

const DEFAULT_CENTER: L.LatLngExpression = [-34.6037, -58.3816];
const DEFAULT_ZOOM = 12;

function markerOptions(selected: boolean): L.CircleMarkerOptions {
  if (selected) {
    return {
      color: "#ffffff",
      fillColor: "#ec4913",
      fillOpacity: 0.92,
      weight: 2,
      radius: 9,
    };
  }

  return {
    color: "#ec4913",
    fillColor: "#ffffff",
    fillOpacity: 0.86,
    weight: 1.8,
    radius: 6.5,
  };
}

export function ListingsMap({
  messages,
  listings,
  selectedListingId,
  onSelectListing,
}: ListingsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef(new Map<string, L.CircleMarker>());
  const points = useMemo(() => getListingPoints(listings), [listings]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      scrollWheelZoom: true,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapRef.current = map;
    map.invalidateSize();

    return () => {
      markersRef.current.forEach((marker) => {
        marker.remove();
      });
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const existingMarkers = markersRef.current;
    const listingIds = new Set(listings.map((listing) => listing.id));

    existingMarkers.forEach((marker, listingId) => {
      if (!listingIds.has(listingId)) {
        marker.remove();
        existingMarkers.delete(listingId);
      }
    });

    listings.forEach((listing) => {
      if (existingMarkers.has(listing.id)) {
        return;
      }

      const point = points[listing.id];
      const marker = L.circleMarker([point.lat, point.lng], markerOptions(false));
      marker
        .bindTooltip(
          `${listing.address} · ${listing.neighborhood}\n${listing.totalReviews} ${messages.reviewsLabel}`,
          {
            direction: "top",
            offset: [0, -8],
            opacity: 0.92,
            sticky: true,
          },
        )
        .on("click", () => onSelectListing(listing.id))
        .addTo(map);

      existingMarkers.set(listing.id, marker);
    });

    if (listings.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: false });
      return;
    }

    if (listings.length === 1) {
      const only = points[listings[0].id];
      map.setView([only.lat, only.lng], 15, { animate: false });
      return;
    }

    const bounds = new L.LatLngBounds(
      listings.map((listing) => {
        const point = points[listing.id];
        return [point.lat, point.lng] as [number, number];
      }),
    );
    map.fitBounds(bounds.pad(0.18), { animate: false });
  }, [listings, messages.reviewsLabel, onSelectListing, points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    markersRef.current.forEach((marker, listingId) => {
      marker.setStyle(markerOptions(listingId === selectedListingId));
    });

    if (!selectedListingId || !points[selectedListingId]) {
      return;
    }

    const point = points[selectedListingId];
    map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), 14), {
      duration: 0.45,
    });
  }, [points, selectedListingId]);

  return (
    <div className="map-canvas">
      <div ref={containerRef} className="map-canvas__inner" />
    </div>
  );
}
