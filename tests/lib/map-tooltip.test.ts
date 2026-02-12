import { describe, expect, it } from "vitest";

import { buildListingTooltipHtml, escapeMapTooltipText } from "@/lib/map-tooltip";

describe("map tooltip sanitizer", () => {
  it("escapes dangerous html characters", () => {
    expect(escapeMapTooltipText(`<script>alert("x")</script>'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&#39;",
    );
  });

  it("builds tooltip html with escaped listing values", () => {
    const html = buildListingTooltipHtml(
      {
        address: `A <img src=x onerror="alert('x')">`,
        neighborhood: "Recoleta",
        totalReviews: 12,
      },
      "reviews",
    );

    expect(html).toContain("&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;");
    expect(html).toContain("<br>");
    expect(html).not.toContain("<script>");
  });
});
