import { describe, expect, it } from "vitest";
import {
  buildCategoryTree,
  categoryIdsUnder,
  categoryPath,
  isParent,
  rootCategoryFor,
  validateCategoryTree,
} from "./categories";
import { applyStarterTaxonomy, STARTER_TAXONOMY_CATEGORY_COUNT } from "./taxonomy";
import type { Category } from "../types/schedule";

const ACADEMICS: Category = { id: "acad", name: "Academics", color: "#3B82F6" };
const ALGEBRA: Category = {
  id: "alg",
  name: "Algebra",
  color: "#3B82F6",
  parentId: "acad",
};
const HOUSEHOLD: Category = { id: "house", name: "Household", color: "#F97316" };

describe("buildCategoryTree", () => {
  it("groups children under their parent and leaves childless roots empty", () => {
    const tree = buildCategoryTree([ACADEMICS, ALGEBRA, HOUSEHOLD]);
    expect(tree.map((n) => n.category.id)).toEqual(["acad", "house"]);
    expect(tree[0]!.children.map((c) => c.id)).toEqual(["alg"]);
    expect(tree[1]!.children).toEqual([]);
  });
});

describe("rootCategoryFor", () => {
  it("returns a top-level category unchanged", () => {
    expect(rootCategoryFor([ACADEMICS, ALGEBRA], "acad")?.id).toBe("acad");
  });

  it("rolls a subcategory up to its parent", () => {
    expect(rootCategoryFor([ACADEMICS, ALGEBRA], "alg")?.id).toBe("acad");
  });

  it("returns null for a null or unknown id", () => {
    expect(rootCategoryFor([ACADEMICS], null)).toBeNull();
    expect(rootCategoryFor([ACADEMICS], "ghost")).toBeNull();
  });
});

describe("categoryPath", () => {
  it("renders a child as 'Parent › Child'", () => {
    expect(categoryPath([ACADEMICS, ALGEBRA], "alg")).toBe("Academics › Algebra");
  });

  it("renders a top-level category as just its name", () => {
    expect(categoryPath([ACADEMICS], "acad")).toBe("Academics");
  });
});

describe("categoryIdsUnder", () => {
  it("includes a parent and all its children", () => {
    expect(categoryIdsUnder([ACADEMICS, ALGEBRA, HOUSEHOLD], "acad").sort()).toEqual([
      "acad",
      "alg",
    ]);
  });

  it("is just the id itself for a leaf", () => {
    expect(categoryIdsUnder([ACADEMICS, ALGEBRA], "alg")).toEqual(["alg"]);
  });
});

describe("isParent", () => {
  it("distinguishes parents from leaves", () => {
    expect(isParent([ACADEMICS, ALGEBRA], "acad")).toBe(true);
    expect(isParent([ACADEMICS, ALGEBRA], "alg")).toBe(false);
  });
});

describe("validateCategoryTree", () => {
  it("accepts a well-formed two-level tree", () => {
    expect(validateCategoryTree([ACADEMICS, ALGEBRA, HOUSEHOLD])).toEqual([]);
  });

  it("rejects three levels of nesting", () => {
    const grandchild: Category = {
      id: "gc",
      name: "Linear",
      color: "#000",
      parentId: "alg",
    };
    const problems = validateCategoryTree([ACADEMICS, ALGEBRA, grandchild]);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.message).toMatch(/two levels/);
  });

  it("rejects a parent that doesn't exist", () => {
    const orphan: Category = { id: "o", name: "Orphan", color: "#000", parentId: "ghost" };
    expect(validateCategoryTree([orphan])[0]!.message).toMatch(/doesn't exist/);
  });

  it("rejects a category that is its own parent", () => {
    const loop: Category = { id: "x", name: "Loop", color: "#000", parentId: "x" };
    expect(validateCategoryTree([loop])[0]!.message).toMatch(/its own parent/);
  });
});

describe("applyStarterTaxonomy", () => {
  it("creates the full taxonomy from an empty start", () => {
    const result = applyStarterTaxonomy([]);
    expect(result.categories).toHaveLength(STARTER_TAXONOMY_CATEGORY_COUNT);
    expect(result.created).toBe(STARTER_TAXONOMY_CATEGORY_COUNT);
    expect(result.reused).toBe(0);
    expect(validateCategoryTree(result.categories)).toEqual([]);
  });

  it("keeps the id of an existing category matched by name, so blocks aren't orphaned", () => {
    // This is the property that stops "replace the taxonomy" becoming
    // "silently break every block", since RoutineBlock.categoryId is
    // required and would otherwise dangle.
    const existing: Category[] = [
      { id: "cat-academics", name: "Academics", color: "#111111" },
      { id: "cat-household", name: "Household", color: "#222222" },
    ];
    const result = applyStarterTaxonomy(existing);

    const academics = result.categories.find((c) => c.name === "Academics");
    const household = result.categories.find((c) => c.name === "Household");
    expect(academics?.id).toBe("cat-academics");
    expect(household?.id).toBe("cat-household");
    expect(result.reused).toBe(2);
    expect(result.keptExtra).toEqual([]);
  });

  it("matches names case- and whitespace-insensitively", () => {
    const result = applyStarterTaxonomy([
      { id: "keep-me", name: "  aCaDeMiCs ", color: "#111" },
    ]);
    expect(result.categories.find((c) => c.name === "Academics")?.id).toBe("keep-me");
  });

  it("retains categories that aren't in the taxonomy rather than deleting them", () => {
    const existing: Category[] = [{ id: "misc", name: "Miscellaneous", color: "#999" }];
    const result = applyStarterTaxonomy(existing);
    expect(result.keptExtra.map((c) => c.id)).toEqual(["misc"]);
    expect(result.categories.some((c) => c.id === "misc")).toBe(true);
  });

  it("promotes a kept category to top level when its parent didn't survive", () => {
    const existing: Category[] = [
      { id: "gone", name: "Obsolete", color: "#999" },
      { id: "child", name: "Leftover", color: "#999", parentId: "gone" },
    ];
    const result = applyStarterTaxonomy(existing);
    // Both are kept, and neither ends up with a dangling parent reference.
    expect(validateCategoryTree(result.categories)).toEqual([]);
  });

  it("applies taxonomy colours even to reused categories, avoiding collisions", () => {
    // The owner's Household was amber, which is the taxonomy's Nutrition
    // colour — preserving it would put two top-level categories on the
    // same hue.
    const result = applyStarterTaxonomy([
      { id: "cat-household", name: "Household", color: "#F59E0B" },
    ]);
    const household = result.categories.find((c) => c.name === "Household");
    const nutrition = result.categories.find((c) => c.name === "Nutrition");
    expect(household?.color).not.toBe(nutrition?.color);
  });

  it("produces a valid tree and unique ids", () => {
    const result = applyStarterTaxonomy([
      { id: "cat-academics", name: "Academics", color: "#111" },
      { id: "misc", name: "Miscellaneous", color: "#999" },
    ]);
    const ids = result.categories.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(validateCategoryTree(result.categories)).toEqual([]);
  });
});
