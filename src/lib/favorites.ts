import { dbQuery, withTransaction } from "@/lib/db";

interface FavoriteListingRow {
  listing_id: string;
}

interface ListingExistsRow {
  id: string;
}

interface DatabaseErrorShape {
  code?: string;
  message?: string;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isMissingFavoritesSchemaError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const { code, message } = error as DatabaseErrorShape;
  if (code === "42P01") {
    return true;
  }

  return typeof message === "string" && message.includes("listing_favorites");
}

export async function getFavoriteListingIdsForUser(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!isLikelyEmail(normalizedEmail)) {
    return { ok: false as const, reason: "invalid_email" as const };
  }

  try {
    const result = await dbQuery<FavoriteListingRow>(
      `
        SELECT listing_id
        FROM listing_favorites
        WHERE user_email = $1
        ORDER BY created_at DESC, listing_id ASC
      `,
      [normalizedEmail],
    );

    return {
      ok: true as const,
      listingIds: result.rows.map((row) => row.listing_id),
    };
  } catch (error) {
    if (isMissingFavoritesSchemaError(error)) {
      return { ok: false as const, reason: "schema_missing" as const };
    }
    return { ok: false as const, reason: "db_error" as const };
  }
}

export async function setListingFavoriteForUser(
  email: string,
  listingId: string,
  favorite: boolean,
) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedListingId = listingId.trim();

  if (!isLikelyEmail(normalizedEmail) || !normalizedListingId) {
    return { ok: false as const, reason: "invalid_request" as const };
  }

  try {
    return await withTransaction(async (client) => {
      const listingResult = await client.query<ListingExistsRow>(
        `
          SELECT id
          FROM listings
          WHERE id = $1
          LIMIT 1
        `,
        [normalizedListingId],
      );

      if (listingResult.rowCount === 0) {
        return { ok: false as const, reason: "not_found" as const };
      }

      if (favorite) {
        await client.query(
          `
            INSERT INTO listing_favorites (user_email, listing_id)
            VALUES ($1, $2)
            ON CONFLICT (user_email, listing_id) DO NOTHING
          `,
          [normalizedEmail, normalizedListingId],
        );
      } else {
        await client.query(
          `
            DELETE FROM listing_favorites
            WHERE user_email = $1
              AND listing_id = $2
          `,
          [normalizedEmail, normalizedListingId],
        );
      }

      return {
        ok: true as const,
        listingId: normalizedListingId,
        favorite,
      };
    });
  } catch (error) {
    if (isMissingFavoritesSchemaError(error)) {
      return { ok: false as const, reason: "schema_missing" as const };
    }
    return { ok: false as const, reason: "db_error" as const };
  }
}
