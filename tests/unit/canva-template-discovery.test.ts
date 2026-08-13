import { describe, expect, it } from "vitest";
import {
  filterBrandTemplatesByTitle,
  sanitizeBrandTemplate,
} from "@/lib/canva/templates";
import type { CanvaBrandTemplate } from "@/lib/canva/types";

const samples: CanvaBrandTemplate[] = [
  {
    id: "t1",
    title: "Summer Camp Flyer",
    thumbnail: { width: 100, height: 100, url: "https://example.com/a.png" },
    created_at: 1,
    updated_at: 2,
  },
  {
    id: "t2",
    title: "Holiday Social Post",
    created_at: 3,
  },
  {
    id: "t3",
    title: "AI Marketing 2.0 Event",
  },
];

describe("Brand Template discovery helpers", () => {
  it("sanitizes to id/title/thumbnail/created/updated only", () => {
    expect(sanitizeBrandTemplate(samples[0])).toEqual({
      id: "t1",
      title: "Summer Camp Flyer",
      thumbnailUrl: "https://example.com/a.png",
      createdAt: 1,
      updatedAt: 2,
    });
  });

  it("lists all templates when no title filter is provided", () => {
    expect(filterBrandTemplatesByTitle(samples).map((t) => t.id)).toEqual([
      "t1",
      "t2",
      "t3",
    ]);
  });

  it("optionally filters by template title only (not Brand Kit membership)", () => {
    expect(
      filterBrandTemplatesByTitle(samples, "social").map((t) => t.id),
    ).toEqual(["t2"]);
    expect(
      filterBrandTemplatesByTitle(samples, "AI Marketing 2.0").map((t) => t.id),
    ).toEqual(["t3"]);
    // Titles without the Brand Kit name remain discoverable with no filter.
    expect(filterBrandTemplatesByTitle(samples, "").map((t) => t.title)).toEqual(
      ["Summer Camp Flyer", "Holiday Social Post", "AI Marketing 2.0 Event"],
    );
  });
});
