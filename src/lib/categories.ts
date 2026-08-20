/**
 * Pure helpers for the two-level category tree. Kept out of `engine/`
 * because it's presentation-adjacent (grouping, labels, resolving a
 * display colour) rather than scheduling maths, but it's pure and tested
 * like engine code is.
 *
 * The tree is stored flat with `parentId` references. A block may point
 * at either a parent or a child — the owner chose "either level is fine"
 * so that adding a block quickly never forces you to over-specify. That
 * choice is why almost everything here has to cope with a category that
 * has no children and no parent.
 */

import type { Category } from "../types/schedule";

export interface CategoryNode {
  category: Category;
  children: Category[];
}

/** Top-level categories, each with its children attached, both in the
 * order they appear in the source list. */
export function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const roots = categories.filter((category) => !category.parentId);
  return roots.map((category) => ({
    category,
    children: categories.filter((child) => child.parentId === category.id),
  }));
}

export function isParent(categories: Category[], id: string): boolean {
  return categories.some((category) => category.parentId === id);
}

/** The category a block should be *counted under* when rolling up to
 * top level: itself if it's already top-level, otherwise its parent.
 * Returns null when the id resolves to nothing, which is the honest
 * answer for a block whose category was deleted out from under it. */
export function rootCategoryFor(
  categories: Category[],
  categoryId: string | null,
): Category | null {
  if (!categoryId) return null;
  const category = categories.find((c) => c.id === categoryId);
  if (!category) return null;
  if (!category.parentId) return category;
  return categories.find((c) => c.id === category.parentId) ?? category;
}

/** "Academics › Algebra" for a child, plain "Academics" for a top-level
 * category. Used anywhere a category needs to be unambiguous on its own,
 * such as a picker option or a chart label. */
export function categoryPath(categories: Category[], categoryId: string): string {
  const category = categories.find((c) => c.id === categoryId);
  if (!category) return "Unknown";
  if (!category.parentId) return category.name;
  const parent = categories.find((c) => c.id === category.parentId);
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

/** A subcategory with no colour of its own shows its parent's, so a chart
 * stays visually grouped by top-level category by default. */
export function resolveCategoryColor(
  categories: Category[],
  categoryId: string | null,
): string | null {
  if (!categoryId) return null;
  const category = categories.find((c) => c.id === categoryId);
  if (!category) return null;
  return category.color;
}

/**
 * Every id that should count toward `categoryId` — itself plus, when it's
 * a parent, all of its children. Analytics uses this so selecting
 * "Academics" includes time logged against "Academics › Algebra".
 */
export function categoryIdsUnder(categories: Category[], categoryId: string): string[] {
  const children = categories
    .filter((c) => c.parentId === categoryId)
    .map((c) => c.id);
  return [categoryId, ...children];
}

export interface CategoryTreeProblem {
  categoryId: string;
  message: string;
}

/**
 * Structural checks the two-level rule depends on. Returns every problem
 * rather than the first, matching how transfer.ts reports import errors.
 */
export function validateCategoryTree(categories: Category[]): CategoryTreeProblem[] {
  const problems: CategoryTreeProblem[] = [];
  const byId = new Map(categories.map((c) => [c.id, c]));

  for (const category of categories) {
    if (!category.parentId) continue;

    if (category.parentId === category.id) {
      problems.push({
        categoryId: category.id,
        message: `"${category.name}" is its own parent`,
      });
      continue;
    }

    const parent = byId.get(category.parentId);
    if (!parent) {
      problems.push({
        categoryId: category.id,
        message: `"${category.name}" points at a parent that doesn't exist`,
      });
      continue;
    }

    if (parent.parentId) {
      problems.push({
        categoryId: category.id,
        message: `"${category.name}" is nested more than two levels deep`,
      });
    }
  }

  return problems;
}
