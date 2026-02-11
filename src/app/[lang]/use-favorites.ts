"use client";

import { useEffect, useMemo, useState } from "react";

interface FavoritesMessages {
  accessUnknownError: string;
  favoriteLoginHint: string;
  favoriteAdd: string;
  favoriteRemove: string;
  accessLoginUnavailableError: string;
}

export function useFavorites(isLoggedIn: boolean, messages: FavoritesMessages) {
  const [favoriteListingIds, setFavoriteListingIds] = useState<string[]>([]);
  const [favoritePendingListingIds, setFavoritePendingListingIds] = useState<string[]>([]);
  const [favoriteActionError, setFavoriteActionError] = useState("");

  const favoriteListingIdSet = useMemo(() => new Set(favoriteListingIds), [favoriteListingIds]);
  const favoritePendingListingIdSet = useMemo(
    () => new Set(favoritePendingListingIds),
    [favoritePendingListingIds],
  );

  useEffect(() => {
    if (!isLoggedIn) {
      setFavoriteListingIds([]);
      setFavoritePendingListingIds([]);
      return;
    }

    let cancelled = false;

    async function loadFavorites() {
      try {
        const response = await fetch("/api/favorites");
        if (!response.ok) {
          setFavoriteActionError(messages.accessUnknownError);
          return;
        }

        const payload = (await response.json()) as { listingIds?: string[] };
        if (cancelled) {
          return;
        }

        if (!Array.isArray(payload.listingIds)) {
          setFavoriteListingIds([]);
          return;
        }

        const normalized = payload.listingIds
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean);
        setFavoriteListingIds(Array.from(new Set(normalized)));
        setFavoriteActionError("");
      } catch {
        // Keep UI functional even when favorites cannot be loaded.
        setFavoriteActionError(messages.accessUnknownError);
      }
    }

    void loadFavorites();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, messages.accessUnknownError]);

  function getFavoriteAriaLabel(isFavorite: boolean) {
    if (!isLoggedIn) {
      return messages.favoriteLoginHint;
    }
    return isFavorite ? messages.favoriteRemove : messages.favoriteAdd;
  }

  async function toggleFavorite(listingId: string) {
    if (!isLoggedIn) {
      setFavoriteActionError(messages.favoriteLoginHint);
      return;
    }

    if (favoritePendingListingIdSet.has(listingId)) {
      return;
    }

    const isFavorite = favoriteListingIdSet.has(listingId);
    setFavoritePendingListingIds((current) => [...current, listingId]);
    setFavoriteActionError("");

    try {
      const response = await fetch("/api/favorites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: isFavorite ? "remove" : "add",
          listingId,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setFavoriteActionError(messages.favoriteLoginHint);
        } else if (response.status === 503) {
          setFavoriteActionError(messages.accessLoginUnavailableError);
        } else {
          setFavoriteActionError(messages.accessUnknownError);
        }
        return;
      }

      const payload = (await response.json().catch(() => null)) as { favorite?: boolean } | null;
      const nextFavoriteValue = typeof payload?.favorite === "boolean" ? payload.favorite : !isFavorite;

      setFavoriteListingIds((current) => {
        const next = new Set(current);
        if (nextFavoriteValue) {
          next.add(listingId);
        } else {
          next.delete(listingId);
        }
        return Array.from(next);
      });
    } catch {
      // Ignore transient save errors; user can retry from the same control.
      setFavoriteActionError(messages.accessUnknownError);
    } finally {
      setFavoritePendingListingIds((current) => current.filter((id) => id !== listingId));
    }
  }

  return {
    favoriteListingIds,
    favoritePendingListingIds,
    favoriteListingIdSet,
    favoritePendingListingIdSet,
    favoriteActionError,
    getFavoriteAriaLabel,
    toggleFavorite,
  };
}
