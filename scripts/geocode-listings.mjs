import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DATASET_FILE = path.join(ROOT, "src", "data", "accommodations.json");
const CACHE_FILE = path.join(ROOT, "data", "geocoding.cache.json");

const BOUNDS = {
  minLat: -34.73,
  maxLat: -34.49,
  minLng: -58.56,
  maxLng: -58.32,
};

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withinBounds(latitude, longitude) {
  return (
    latitude >= BOUNDS.minLat &&
    latitude <= BOUNDS.maxLat &&
    longitude >= BOUNDS.minLng &&
    longitude <= BOUNDS.maxLng
  );
}

function normalizeAddressForGeocode(value) {
  let normalized = String(value || "");
  if (normalized.includes(",")) {
    normalized = normalized.split(",")[0];
  }
  normalized = normalized.replace(/\(.*?\)/g, " ");
  normalized = normalized.replace(/\b(apartamento|depto|departamento|piso)\b[^\d]*\d*\w*/gi, " ");
  normalized = normalized.replace(/\bbalcarcr\b/gi, "Balcarce");
  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized;
}

async function loadJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function searchNominatim(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ar");
  url.searchParams.set("viewbox", "-58.56,-34.49,-58.32,-34.73");
  url.searchParams.set("bounded", "1");
  url.searchParams.set("addressdetails", "0");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "user-agent": "infiuba-alojamientos/0.1 (contact: info@infiuba.org)",
      },
    });

    if (response.status === 429 || response.status >= 500) {
      await sleep((attempt + 1) * 1500);
      continue;
    }

    if (!response.ok) {
      return undefined;
    }

    const results = await response.json();
    if (!Array.isArray(results) || results.length === 0) {
      return undefined;
    }

    const first = results[0];
    const latitude = Number.parseFloat(first.lat);
    const longitude = Number.parseFloat(first.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return undefined;
    }

    if (!withinBounds(latitude, longitude)) {
      return undefined;
    }

    return {
      latitude,
      longitude,
      displayName: first.display_name || "",
    };
  }

  return undefined;
}

async function run() {
  const dataset = await loadJson(DATASET_FILE, null);
  if (!dataset || !Array.isArray(dataset.listings)) {
    throw new Error(`Could not load dataset file: ${DATASET_FILE}`);
  }

  const cache = await loadJson(CACHE_FILE, {});
  let updated = 0;
  let fromCache = 0;
  let missing = 0;
  let requests = 0;

  for (const listing of dataset.listings) {
    if (
      typeof listing.latitude === "number" &&
      typeof listing.longitude === "number" &&
      withinBounds(listing.latitude, listing.longitude)
    ) {
      continue;
    }

    const cached = cache[listing.id];
    if (
      cached &&
      typeof cached.latitude === "number" &&
      typeof cached.longitude === "number" &&
      withinBounds(cached.latitude, cached.longitude)
    ) {
      listing.latitude = cached.latitude;
      listing.longitude = cached.longitude;
      fromCache += 1;
      continue;
    }

    const queries = [
      `${listing.address}, ${listing.neighborhood}, CABA, Buenos Aires, Argentina`,
      `${listing.address}, ${listing.neighborhood}, Buenos Aires, Argentina`,
      `${listing.address}, Buenos Aires, Argentina`,
    ];

    const cleanAddress = normalizeAddressForGeocode(listing.address);
    if (cleanAddress && cleanAddress !== listing.address) {
      queries.push(`${cleanAddress}, ${listing.neighborhood}, CABA, Buenos Aires, Argentina`);
      queries.push(`${cleanAddress}, ${listing.neighborhood}, Buenos Aires, Argentina`);
      queries.push(`${cleanAddress}, Buenos Aires, Argentina`);
    }

    let found;
    for (const query of queries) {
      requests += 1;
      found = await searchNominatim(query);
      await sleep(1100);
      if (found) {
        break;
      }
    }

    if (!found) {
      missing += 1;
      continue;
    }

    listing.latitude = found.latitude;
    listing.longitude = found.longitude;
    cache[listing.id] = found;
    updated += 1;
  }

  await writeFile(DATASET_FILE, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  await writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, "utf8");

  console.log(
    `Geocoding done. Updated: ${updated}, from cache: ${fromCache}, missing: ${missing}, requests: ${requests}`,
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
