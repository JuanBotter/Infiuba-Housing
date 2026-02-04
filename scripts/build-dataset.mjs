import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_FILE = path.join(
  ROOT,
  "data",
  "Alojamientos Recomendados Infiuba.xlsx - Hoja 1.csv",
);
const OUTPUT_FILE = path.join(ROOT, "src", "data", "accommodations.json");
const PENDING_REVIEWS_FILE = path.join(ROOT, "data", "reviews.pending.json");
const APPROVED_REVIEWS_FILE = path.join(ROOT, "data", "reviews.approved.json");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === "\"") {
        if (text[i + 1] === "\"") {
          cell += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (char !== "\r") {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeText(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function findColumnIndex(header, partialName) {
  const normalizedName = normalizeText(partialName);
  return header.findIndex((column) => normalizeText(column).includes(normalizedName));
}

function parseNumber(value) {
  const clean = value
    .replace(/usd|us\$|\$/gi, "")
    .replace(/\s+/g, "")
    .trim();

  if (!clean) {
    return undefined;
  }

  let canonical = clean;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(canonical)) {
    canonical = canonical.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(canonical)) {
    canonical = canonical.replace(/,/g, "");
  } else {
    canonical = canonical.replace(",", ".");
  }

  const match = canonical.match(/\d+(\.\d+)?/);
  if (!match) {
    return undefined;
  }

  const parsed = Number.parseFloat(match[0]);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  return parsed;
}

function parseInteger(value) {
  const match = value.match(/\d+/);
  if (!match) {
    return undefined;
  }
  const parsed = Number.parseInt(match[0], 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseRating(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.includes("★")) {
    const score = trimmed.split("").filter((char) => char === "★").length;
    return score || undefined;
  }
  const parsed = parseNumber(trimmed);
  if (!parsed) {
    return undefined;
  }
  if (parsed < 1 || parsed > 5) {
    return undefined;
  }
  return parsed;
}

function parseRecommendation(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return undefined;
  }
  if (normalized === "si" || normalized === "sí" || normalized === "yes") {
    return true;
  }
  if (normalized === "no") {
    return false;
  }
  return undefined;
}

function parseYear(value) {
  const match = value.match(/\b(19|20)\d{2}\b/);
  if (!match) {
    return undefined;
  }
  return Number.parseInt(match[0], 10);
}

function median(values) {
  if (!values.length) {
    return undefined;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values) {
  if (!values.length) {
    return undefined;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function slugify(text) {
  return normalizeText(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

async function ensureFileIfMissing(filePath, initialValue = "[]\n") {
  try {
    await access(filePath);
  } catch {
    await writeFile(filePath, initialValue, "utf8");
  }
}

async function run() {
  const csvText = await readFile(SOURCE_FILE, "utf8");
  const rows = parseCsv(csvText);
  const headerIndex = rows.findIndex((row) => normalizeText(row[0] || "") === "marca temporal");
  if (headerIndex < 0) {
    throw new Error("Could not find header row that starts with 'Marca temporal'.");
  }

  const header = rows[headerIndex];
  const columns = {
    timestamp: findColumnIndex(header, "marca temporal"),
    address: findColumnIndex(header, "direccion"),
    neighborhood: findColumnIndex(header, "barrio"),
    ownerContact: findColumnIndex(header, "datos de contacto"),
    price: findColumnIndex(header, "valor alquiler"),
    capacity: findColumnIndex(header, "cuantas personas"),
    comments: findColumnIndex(header, "comentarios"),
    rating: findColumnIndex(header, "califica"),
    recommended: findColumnIndex(header, "recomendarias"),
    studentContact: findColumnIndex(header, "dejanos un telefono"),
  };

  if (columns.address < 0 || columns.neighborhood < 0) {
    throw new Error("Missing required columns: address and neighborhood.");
  }

  const grouped = new Map();
  const dataRows = rows.slice(headerIndex + 1);
  let existingCoordinatesById = new Map();

  try {
    const previousDataset = JSON.parse(await readFile(OUTPUT_FILE, "utf8"));
    if (Array.isArray(previousDataset?.listings)) {
      existingCoordinatesById = new Map(
        previousDataset.listings
          .filter(
            (listing) =>
              typeof listing?.id === "string" &&
              typeof listing?.latitude === "number" &&
              typeof listing?.longitude === "number",
          )
          .map((listing) => [
            listing.id,
            { latitude: listing.latitude, longitude: listing.longitude },
          ]),
      );
    }
  } catch {
    // Ignore when no previous dataset exists.
  }

  dataRows.forEach((row, index) => {
    const address = (row[columns.address] || "").trim();
    if (!address) {
      return;
    }

    const neighborhood = (row[columns.neighborhood] || "").trim() || "Unknown";
    const key = `${normalizeText(address)}|${normalizeText(neighborhood)}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        address,
        neighborhood,
        contacts: new Set(),
        priceValues: [],
        capacityValues: [],
        reviews: [],
      });
    }

    const entry = grouped.get(key);
    const ownerContact = (row[columns.ownerContact] || "").trim();
    const price = parseNumber(row[columns.price] || "");
    const capacity = parseInteger(row[columns.capacity] || "");
    const rating = parseRating(row[columns.rating] || "");
    const recommended = parseRecommendation(row[columns.recommended] || "");
    const comment = (row[columns.comments] || "").trim();
    const studentContact = (row[columns.studentContact] || "").trim();
    const year = parseYear((row[columns.timestamp] || "").trim());

    if (ownerContact) {
      entry.contacts.add(ownerContact);
    }
    if (typeof price === "number") {
      entry.priceValues.push(price);
    }
    if (typeof capacity === "number") {
      entry.capacityValues.push(capacity);
    }

    entry.reviews.push({
      id: `survey-${index + 1}`,
      source: "survey",
      year,
      rating,
      recommended,
      comment: comment || undefined,
      studentContact: studentContact || undefined,
      createdAt: year
        ? `${String(year)}-01-01T00:00:00.000Z`
        : "1970-01-01T00:00:00.000Z",
    });
  });

  const listings = [...grouped.entries()]
    .map(([key, value]) => {
      const reviewRatings = value.reviews
        .map((review) => review.rating)
        .filter((rating) => typeof rating === "number");
      const reviewRecommendations = value.reviews
        .map((review) => review.recommended)
        .filter((recommended) => typeof recommended === "boolean");
      const years = value.reviews
        .map((review) => review.year)
        .filter((year) => typeof year === "number");

      const slugBase = slugify(`${value.neighborhood}-${value.address}`);
      const hash = createHash("sha1").update(key).digest("hex").slice(0, 6);
      const listingId = `${slugBase || "listing"}-${hash}`;
      const existingCoordinates = existingCoordinatesById.get(listingId);

      return {
        id: listingId,
        address: value.address,
        neighborhood: value.neighborhood,
        latitude: existingCoordinates?.latitude,
        longitude: existingCoordinates?.longitude,
        contacts: [...value.contacts],
        priceUsd: median(value.priceValues),
        capacity: median(value.capacityValues),
        averageRating: average(reviewRatings),
        recommendationRate: reviewRecommendations.length
          ? reviewRecommendations.filter(Boolean).length / reviewRecommendations.length
          : undefined,
        totalReviews: value.reviews.length,
        recentYear: years.length ? Math.max(...years) : undefined,
        reviews: value.reviews,
      };
    })
    .sort(
      (a, b) =>
        a.neighborhood.localeCompare(b.neighborhood, "es") ||
        a.address.localeCompare(b.address, "es"),
    );

  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(
    OUTPUT_FILE,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceFile: path.basename(SOURCE_FILE),
        totalListings: listings.length,
        listings,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await ensureFileIfMissing(PENDING_REVIEWS_FILE);
  await ensureFileIfMissing(APPROVED_REVIEWS_FILE);

  console.log(`Created ${listings.length} normalized listings at ${OUTPUT_FILE}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
