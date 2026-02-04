import type { Listing } from "@/types";

export interface MapPoint {
  lat: number;
  lng: number;
}

const BUENOS_AIRES_CENTER: MapPoint = { lat: -34.6037, lng: -58.3816 };

const NEIGHBORHOOD_CENTERS: Record<string, MapPoint> = {
  Almagro: { lat: -34.6096, lng: -58.4211 },
  Balvanera: { lat: -34.6098, lng: -58.4028 },
  Belgrano: { lat: -34.5621, lng: -58.4562 },
  Caballito: { lat: -34.6194, lng: -58.4432 },
  Centro: { lat: -34.6039, lng: -58.3817 },
  Chacarita: { lat: -34.5889, lng: -58.4547 },
  Congreso: { lat: -34.6086, lng: -58.3925 },
  "Las Cañitas": { lat: -34.575, lng: -58.4316 },
  Monserrat: { lat: -34.6119, lng: -58.3817 },
  Palermo: { lat: -34.5826, lng: -58.4248 },
  Recoleta: { lat: -34.5889, lng: -58.3974 },
  Retiro: { lat: -34.5912, lng: -58.3733 },
  "San Nicolás": { lat: -34.6037, lng: -58.3804 },
  "San Telmo": { lat: -34.6205, lng: -58.3731 },
  "Villa Crespo": { lat: -34.5986, lng: -58.4414 },
};

function hash(text: string) {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) {
    value = (value * 31 + text.charCodeAt(i)) >>> 0;
  }
  return value;
}

function neighborhoodCenter(neighborhood: string): MapPoint {
  return NEIGHBORHOOD_CENTERS[neighborhood] || BUENOS_AIRES_CENTER;
}

export function getListingPoint(listing: Listing): MapPoint {
  if (typeof listing.latitude === "number" && typeof listing.longitude === "number") {
    return { lat: listing.latitude, lng: listing.longitude };
  }

  const base = neighborhoodCenter(listing.neighborhood);
  const addressHash = hash(`${listing.neighborhood}|${listing.address}|${listing.id}`);
  const latOffset = ((addressHash % 1000) / 1000 - 0.5) * 0.012;
  const lngOffset = ((((addressHash / 1000) | 0) % 1000) / 1000 - 0.5) * 0.016;

  return {
    lat: base.lat + latOffset,
    lng: base.lng + lngOffset,
  };
}

export function getListingPoints(listings: Listing[]) {
  return listings.reduce<Record<string, MapPoint>>((acc, listing) => {
    acc[listing.id] = getListingPoint(listing);
    return acc;
  }, {});
}
