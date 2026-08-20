/**
 * The starter category taxonomy — a full two-level tree aimed at a
 * graduate student, offered as a replacement for the ad-hoc categories
 * you'd otherwise accumulate. Two problems it solves: an empty picker on
 * first run, and label drift ("Cleaning" one week, "Daily Cleaning" the
 * next) that quietly splits a category in the analytics.
 *
 * Colours are assigned per top-level category only; subcategories inherit
 * their parent's colour when created, so charts stay grouped by
 * top-level at a glance and the palette doesn't grow to 45 hues nobody
 * can tell apart. A subcategory's colour is still editable afterwards.
 *
 * This is data, not law. Everything here is editable and deletable once
 * applied; nothing in the app depends on a particular category existing.
 */

import type { Category } from "../types/schedule";
import { shadeVariant } from "./color";

export interface TaxonomyEntry {
  name: string;
  color: string;
  children: string[];
}

export const STARTER_TAXONOMY: readonly TaxonomyEntry[] = [
  {
    name: "Academics",
    color: "#3B82F6", // blue
    children: [
      "Coursework",
      "Research",
      "Problem Sets",
      "Reading & Literature",
      "Notes & Writing",
      "Flashcards & Review",
      "Teaching & TA",
      "Seminars & Talks",
      "Exam Prep",
    ],
  },
  {
    name: "Admin",
    color: "#8B5CF6", // violet
    children: [
      "Email & Messages",
      "Planning & Scheduling",
      "Finances",
      "Forms & Paperwork",
      "Errands",
    ],
  },
  {
    name: "Health",
    color: "#10B981", // emerald
    children: [
      "Exercise",
      "Movement & Stretching",
      "Medication",
      "Appointments",
      "Therapy & Counseling",
      "Sleep Hygiene",
    ],
  },
  {
    name: "Nutrition",
    color: "#F59E0B", // amber
    children: ["Meal Prep", "Breakfast", "Lunch", "Dinner", "Groceries", "Hydration"],
  },
  {
    name: "Household",
    color: "#F97316", // orange
    children: [
      "Daily Tidy",
      "Deep Cleaning",
      "Laundry",
      "Dishes",
      "Maintenance & Repairs",
      "Organizing",
    ],
  },
  {
    name: "Routines",
    color: "#64748B", // slate
    children: [
      "Morning Routine",
      "Evening Wind-Down",
      "Transitions & Breaks",
      "Commute",
    ],
  },
  {
    name: "Social",
    color: "#EC4899", // pink
    children: ["Family", "Friends", "Partner", "Calls & Check-ins", "Events"],
  },
  {
    name: "Rest & Recreation",
    color: "#14B8A6", // teal
    children: [
      "Downtime",
      "Hobbies",
      "Reading (Leisure)",
      "Games",
      "Media",
      "Outdoors",
    ],
  },
];

export const STARTER_TAXONOMY_CATEGORY_COUNT = STARTER_TAXONOMY.reduce(
  (total, entry) => total + 1 + entry.children.length,
  0,
);

export interface ApplyTaxonomyResult {
  categories: Category[];
  /** Categories newly created by applying the taxonomy. */
  created: number;
  /** Existing categories matched by name and kept by id. */
  reused: number;
  /** Existing categories not in the taxonomy, retained as-is. */
  keptExtra: Category[];
}

const normalize = (name: string) => name.trim().toLowerCase();

/**
 * Produces the category list after adopting the starter taxonomy.
 *
 * The critical property: **an existing category whose name matches a
 * taxonomy entry keeps its id.** `RoutineBlock.categoryId` is required,
 * so a "replacement" that minted fresh ids for everything would leave
 * every existing block pointing at a category that no longer exists —
 * turning a tidy-up into data loss. Matching by name means the owner's
 * Academics/Household/Nutrition/Routines blocks carry over untouched.
 *
 * Categories that aren't in the taxonomy are **kept**, not deleted, for
 * the same reason: blocks may still reference them. They're reported back
 * as `keptExtra` so the UI can say so plainly rather than pretending the
 * replacement was total.
 *
 * Colours come from the taxonomy even for reused categories — a coherent
 * palette is the point of adopting it, and preserving old colours can
 * collide (the owner's Household amber is the taxonomy's Nutrition).
 */
export function applyStarterTaxonomy(existing: Category[]): ApplyTaxonomyResult {
  const categories: Category[] = [];
  const consumedIds = new Set<string>();
  let created = 0;
  let reused = 0;

  for (const entry of STARTER_TAXONOMY) {
    const match = existing.find(
      (c) => !c.parentId && normalize(c.name) === normalize(entry.name),
    );
    const parentId = match?.id ?? crypto.randomUUID();
    if (match) {
      reused += 1;
      consumedIds.add(match.id);
    } else {
      created += 1;
    }
    categories.push({ id: parentId, name: entry.name, color: entry.color });

    entry.children.forEach((childName, index) => {
      // A distinct shade of the parent hue rather than the parent's exact
      // colour: everything under Academics still reads as blue, but the
      // subcategories are tellable apart. Flat inheritance made every
      // block in a family render identically.
      const childColor = shadeVariant(entry.color, index, entry.children.length);
      const childMatch = existing.find(
        (c) => c.parentId === parentId && normalize(c.name) === normalize(childName),
      );
      if (childMatch) {
        reused += 1;
        consumedIds.add(childMatch.id);
        categories.push({ ...childMatch, name: childName, color: childColor, parentId });
      } else {
        created += 1;
        categories.push({
          id: crypto.randomUUID(),
          name: childName,
          color: childColor,
          parentId,
        });
      }
    });
  }

  const survivingIds = new Set(categories.map((c) => c.id));
  const keptExtra = existing
    .filter((c) => !consumedIds.has(c.id))
    // Promote to top level if its parent didn't survive, so we never leave
    // a dangling parentId behind.
    .map((c) => (c.parentId && !survivingIds.has(c.parentId) ? { ...c, parentId: undefined } : c));

  return { categories: [...categories, ...keptExtra], created, reused, keptExtra };
}
