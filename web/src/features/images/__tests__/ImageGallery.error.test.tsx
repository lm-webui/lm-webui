import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ImageGallery from "../ImageGallery";

// The gallery now distinguishes "the fetch failed" from "you have no images".
// Before, both rendered the empty state, so a dead backend told the user to go
// generate something instead of telling them nothing was reachable.
describe("ImageGallery load states", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the error state, not the empty state, when the fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("backend down"))));
    render(<ImageGallery />);

    expect(await screen.findByText("Couldn't load images")).toBeTruthy();
    expect(screen.queryByText("No images saved yet")).toBeNull();
  });

  it("shows the error state when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 500 })));
    render(<ImageGallery />);

    expect(await screen.findByText("Couldn't load images")).toBeTruthy();
  });

  it("shows the empty state when the gallery really is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ images: [] }) })),
    );
    render(<ImageGallery />);

    expect(await screen.findByText("No images saved yet")).toBeTruthy();
    expect(screen.queryByText("Couldn't load images")).toBeNull();
  });
});
