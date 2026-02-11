import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContactRichText } from "@/components/contact-rich-text";

describe("ContactRichText", () => {
  it("renders email, phone, and url links with expected attributes", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        "div",
        null,
        React.createElement(ContactRichText, {
          contact: "Email user@example.com or call +54 11 5555 5555. Site: www.example.com",
        }),
      ),
    );

    expect(html).toContain('href="mailto:user%40example.com"');
    expect(html).toContain('href="tel:+541155555555"');
    expect(html).toContain('href="https://www.example.com/"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
  });

  it("keeps plain text segments for non-link content", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        "div",
        null,
        React.createElement(ContactRichText, {
          contact: "No structured contact details here",
        }),
      ),
    );

    expect(html).toContain("No structured contact details here");
    expect(html).not.toContain("<a ");
  });
});
