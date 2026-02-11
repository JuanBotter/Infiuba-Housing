import { describe, expect, it } from "vitest";

import { getMessages, pickMessages } from "@/lib/i18n";

describe("pickMessages", () => {
  it("returns only the requested localized keys", () => {
    const en = getMessages("en");
    const picked = pickMessages(en, ["themeToggleLabel", "themeDark"] as const);

    expect(picked).toEqual({
      themeToggleLabel: en.themeToggleLabel,
      themeDark: en.themeDark,
    });
    expect("themeLight" in picked).toBe(false);
  });
});
