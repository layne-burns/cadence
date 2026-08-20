/**
 * Colour helpers for tinting UI from user-chosen category colours.
 *
 * Category colours come from a native `<input type="color">` and the
 * starter taxonomy, so in practice they're always 6-digit hex. The
 * functions here verify that rather than assume it, because
 * `Category.color` is typed as "any valid CSS colour" and a hand-edited
 * import could legitimately carry `rebeccapurple`.
 */

const SIX_DIGIT_HEX = /^#[0-9a-f]{6}$/i;

/**
 * Returns `color` with an alpha channel appended, or null when the input
 * isn't a form we can safely modify. Callers treat null as "skip the
 * tint" rather than substituting a guess, so an unusual colour degrades
 * to a plain background instead of a wrong one.
 */
export function withAlpha(color: string | null | undefined, alpha: number): string | null {
  if (!color || !SIX_DIGIT_HEX.test(color)) return null;
  const clamped = Math.min(Math.max(alpha, 0), 1);
  const hex = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0");
  return `${color}${hex}`;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function hslToHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  return `#${rgb
    .map((v) =>
      Math.round((v + m) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Lightness bounds for generated shades. Kept away from the extremes so
 * every variant stays a usable accent — readable against both themes and
 * still recognisably the parent hue rather than near-white or near-black. */
const MIN_SHADE_L = 0.34;
const MAX_SHADE_L = 0.68;

/**
 * A distinct shade of `hex` for item `index` of `total`, spread evenly
 * across a safe lightness band.
 *
 * Subcategories all inheriting their parent's exact colour meant every
 * block under "Academics" rendered identically — grouped, but
 * indistinguishable. Varying lightness within one hue keeps the grouping
 * legible at a glance (all Academics work still reads as blue) while
 * making the individual subcategories tellable apart, which flat
 * inheritance couldn't do and eight unrelated hues per parent would
 * destroy.
 */
export function shadeVariant(hex: string, index: number, total: number): string {
  if (!SIX_DIGIT_HEX.test(hex) || total <= 1 || index < 0) return hex;
  const { h, s } = hexToHsl(hex);
  const step = (MAX_SHADE_L - MIN_SHADE_L) / Math.max(total - 1, 1);
  const l = MIN_SHADE_L + step * Math.min(index, total - 1);
  return hslToHex({ h, s, l });
}
