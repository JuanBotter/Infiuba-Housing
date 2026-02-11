import { describe, expect, it } from "vitest";

import {
  buildReviewTranslationSelectSql,
  getTranslatedCommentForLanguage,
} from "@/lib/review-translations";

describe("review-translations", () => {
  it("builds SQL column list without prefix", () => {
    const sql = buildReviewTranslationSelectSql();
    expect(sql).toContain("comment_en");
    expect(sql).toContain("comment_no");
    expect(sql).not.toContain("r.comment_en");
  });

  it("builds SQL column list with prefix", () => {
    const sql = buildReviewTranslationSelectSql("r");
    expect(sql).toContain("r.comment_en");
    expect(sql).toContain("r.comment_no");
  });

  it("returns translated comment for the requested language", () => {
    const translated = getTranslatedCommentForLanguage(
      {
        comment_en: "English comment",
        comment_es: " Comentario ",
      },
      "es",
    );

    expect(translated).toBe("Comentario");
  });
});
