interface GeocodePoint {
  latitude: number;
  longitude: number;
}

const AUTO_GEOCODE_NEW_LISTINGS_ENV = "AUTO_GEOCODE_NEW_LISTINGS";
const AUTO_GEOCODE_NEW_LISTINGS_PROD_ACK_ENV = "AUTO_GEOCODE_NEW_LISTINGS_ALLOW_PRODUCTION";

const BUENOS_AIRES_BOUNDS = {
  minLat: -34.73,
  maxLat: -34.49,
  minLng: -58.56,
  maxLng: -58.32,
};

const DEFAULT_USER_AGENT = "infiuba-alojamientos/0.1 (auto-geocode new listings)";

function parseBooleanEnvFlag(raw: string | undefined) {
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function withinBuenosAiresBounds(latitude: number, longitude: number) {
  return (
    latitude >= BUENOS_AIRES_BOUNDS.minLat &&
    latitude <= BUENOS_AIRES_BOUNDS.maxLat &&
    longitude >= BUENOS_AIRES_BOUNDS.minLng &&
    longitude <= BUENOS_AIRES_BOUNDS.maxLng
  );
}

function normalizeAddressForGeocode(value: string) {
  let normalized = String(value || "");
  if (normalized.includes(",")) {
    normalized = normalized.split(",")[0] || "";
  }
  normalized = normalized.replace(/\(.*?\)/g, " ");
  normalized = normalized.replace(/\b(apartamento|depto|departamento|piso)\b[^\d]*\d*\w*/gi, " ");
  normalized = normalized.replace(/\bbalcarcr\b/gi, "Balcarce");
  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized;
}

function buildBuenosAiresQueries(address: string, neighborhood: string) {
  const queries = [
    `${address}, ${neighborhood}, CABA, Buenos Aires, Argentina`,
    `${address}, ${neighborhood}, Buenos Aires, Argentina`,
    `${address}, Buenos Aires, Argentina`,
  ];

  const normalizedAddress = normalizeAddressForGeocode(address);
  if (normalizedAddress && normalizedAddress !== address) {
    queries.push(`${normalizedAddress}, ${neighborhood}, CABA, Buenos Aires, Argentina`);
    queries.push(`${normalizedAddress}, ${neighborhood}, Buenos Aires, Argentina`);
    queries.push(`${normalizedAddress}, Buenos Aires, Argentina`);
  }

  return queries.map((query) => query.trim()).filter(Boolean);
}

async function searchNominatim(query: string, { timeoutMs }: { timeoutMs: number }) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ar");
  url.searchParams.set(
    "viewbox",
    `${BUENOS_AIRES_BOUNDS.minLng},${BUENOS_AIRES_BOUNDS.maxLat},${BUENOS_AIRES_BOUNDS.maxLng},${BUENOS_AIRES_BOUNDS.minLat}`,
  );
  url.searchParams.set("bounded", "1");
  url.searchParams.set("addressdetails", "0");

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": process.env.GEOCODE_USER_AGENT || DEFAULT_USER_AGENT,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const results = (await response.json().catch(() => null)) as unknown;
    if (!Array.isArray(results) || results.length === 0) {
      return null;
    }

    const first = results[0] as { lat?: unknown; lon?: unknown };
    const latitude = typeof first.lat === "string" ? Number.parseFloat(first.lat) : NaN;
    const longitude = typeof first.lon === "string" ? Number.parseFloat(first.lon) : NaN;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    if (!withinBuenosAiresBounds(latitude, longitude)) {
      return null;
    }

    return { latitude, longitude } satisfies GeocodePoint;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function isAutoGeocodeNewListingsEnabled() {
  const enabled = parseBooleanEnvFlag(process.env[AUTO_GEOCODE_NEW_LISTINGS_ENV]);
  if (!enabled) {
    return false;
  }

  const isProduction = process.env.NODE_ENV === "production";
  if (
    isProduction &&
    !parseBooleanEnvFlag(process.env[AUTO_GEOCODE_NEW_LISTINGS_PROD_ACK_ENV])
  ) {
    throw new Error(
      `${AUTO_GEOCODE_NEW_LISTINGS_ENV}=true requires ${AUTO_GEOCODE_NEW_LISTINGS_PROD_ACK_ENV}=true in production.`,
    );
  }

  return true;
}

export async function maybeGeocodeBuenosAiresListingAddress(input: {
  address: string;
  neighborhood: string;
}): Promise<GeocodePoint | null> {
  if (!isAutoGeocodeNewListingsEnabled()) {
    return null;
  }

  const address = input.address.trim();
  const neighborhood = input.neighborhood.trim();
  if (!address || !neighborhood) {
    return null;
  }

  const queries = buildBuenosAiresQueries(address, neighborhood);
  if (queries.length === 0) {
    return null;
  }

  for (const query of queries) {
    const found = await searchNominatim(query, { timeoutMs: 2500 });
    if (found) {
      return found;
    }
  }

  return null;
}

