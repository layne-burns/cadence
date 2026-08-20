import { describe, expect, it } from "vitest";
import { shadeVariant, withAlpha } from "./color";

describe("withAlpha", () => {
  it("appends an alpha channel to 6-digit hex", () => {
    expect(withAlpha("#3B82F6", 1)).toBe("#3B82F6ff");
    expect(withAlpha("#3B82F6", 0)).toBe("#3B82F600");
  });

  it("returns null for colours it can't safely modify", () => {
    // Named and shorthand colours are valid CSS but can't take a hex
    // alpha suffix; callers skip the tint rather than guess.
    expect(withAlpha("rebeccapurple", 0.1)).toBeNull();
    expect(withAlpha("#fff", 0.1)).toBeNull();
    expect(withAlpha(null, 0.1)).toBeNull();
    expect(withAlpha(undefined, 0.1)).toBeNull();
  });

  it("clamps out-of-range alpha instead of producing invalid hex", () => {
    expect(withAlpha("#000000", 5)).toBe("#000000ff");
    expect(withAlpha("#000000", -2)).toBe("#00000000");
  });
});

describe("shadeVariant", () => {
  it("returns the colour unchanged when there's only one item", () => {
    expect(shadeVariant("#3B82F6", 0, 1)).toBe("#3B82F6");
  });

  it("produces a distinct colour for each sibling", () => {
    const shades = [0, 1, 2, 3, 4].map((i) => shadeVariant("#3B82F6", i, 5));
    expect(new Set(shades).size).toBe(5);
  });

  it("keeps every shade in the same hue family", () => {
    // All shades of a blue parent should still be blue-dominant, so the
    // grouping stays readable at a glance.
    for (const i of [0, 1, 2, 3, 4]) {
      const shade = shadeVariant("#3B82F6", i, 5);
      const r = parseInt(shade.slice(1, 3), 16);
      const b = parseInt(shade.slice(5, 7), 16);
      expect(b).toBeGreaterThan(r);
    }
  });

  it("gets lighter as the index increases", () => {
    const luminance = (hex: string) =>
      parseInt(hex.slice(1, 3), 16) +
      parseInt(hex.slice(3, 5), 16) +
      parseInt(hex.slice(5, 7), 16);
    const first = shadeVariant("#3B82F6", 0, 4);
    const last = shadeVariant("#3B82F6", 3, 4);
    expect(luminance(last)).toBeGreaterThan(luminance(first));
  });

  it("stays inside the safe band rather than hitting white or black", () => {
    const shades = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => shadeVariant("#3B82F6", i, 9));
    for (const shade of shades) {
      expect(shade).not.toBe("#ffffff");
      expect(shade).not.toBe("#000000");
    }
  });

  it("leaves a colour it can't parse alone", () => {
    expect(shadeVariant("rebeccapurple", 1, 4)).toBe("rebeccapurple");
  });

  it("handles a fully desaturated parent without producing NaN", () => {
    const shade = shadeVariant("#808080", 1, 3);
    expect(shade).toMatch(/^#[0-9a-f]{6}$/);
  });
});
