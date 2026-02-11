import { describe, expect, it } from "vitest";

import { formatDateTime, getLocaleForLang } from "@/lib/format";

describe("formatDateTime", () => {
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  };

  it("formats ISO string values with language locale", () => {
    const value = "2026-02-11T16:20:00.000Z";
    const expected = new Intl.DateTimeFormat(getLocaleForLang("es"), options).format(new Date(value));

    expect(formatDateTime(value, "es")).toBe(expected);
  });

  it("formats Date values with language locale", () => {
    const value = new Date("2026-02-11T16:20:00.000Z");
    const expected = new Intl.DateTimeFormat(getLocaleForLang("en"), options).format(value);

    expect(formatDateTime(value, "en")).toBe(expected);
  });
});
