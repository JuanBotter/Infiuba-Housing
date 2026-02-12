import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const interMock = vi.fn(() => ({ variable: "font-inter" }));
const plusJakartaMock = vi.fn(() => ({ variable: "font-plus-jakarta" }));
const workSansMock = vi.fn(() => ({ variable: "font-work-sans" }));

vi.mock("next/font/google", () => ({
  Inter: interMock,
  Plus_Jakarta_Sans: plusJakartaMock,
  Work_Sans: workSansMock,
}));

vi.mock("next/script", () => ({
  default: (props: { src: string; nonce?: string }) =>
    React.createElement("script", { src: props.src, nonce: props.nonce }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-nonce": "test-nonce" })),
}));

vi.mock("@/app/globals.css", () => ({}));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

let RootLayout: typeof import("@/app/layout").default;

beforeAll(async () => {
  RootLayout = (await import("@/app/layout")).default;
});

describe("RootLayout", () => {
  it("applies loaded font variables to html className", async () => {
    const element = await RootLayout({
      children: React.createElement("main", null, "content"),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('<html lang="en" class="font-plus-jakarta font-work-sans font-inter">');
    expect(markup).toContain('<script src="/theme-init.js" nonce="test-nonce"></script>');
    expect(markup).toContain("<main>content</main>");
    expect(plusJakartaMock).toHaveBeenCalledTimes(1);
    expect(workSansMock).toHaveBeenCalledTimes(1);
    expect(interMock).toHaveBeenCalledTimes(1);
  });
});
