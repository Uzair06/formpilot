import Fuse from 'fuse.js';

// Picks which real option on the page best matches a wanted value.
// Used by the Filler (clicking the option) and the Mapper (checking AI answers are real options).

export const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();

/** Returns the matching option text, or null if nothing is close enough. */
export function matchOption(wanted: string, options: string[]): string | null {
  const target = normalize(wanted);
  if (!target || options.length === 0) return null;

  const exact = options.find((option) => normalize(option) === target);
  if (exact) return exact;

  // "United States" should find "United States of America"; "Yes" should find "Yes, I am".
  const startsWith = options.filter((option) => normalize(option).startsWith(target));
  if (startsWith.length === 1) return startsWith[0]!;
  if (startsWith.length > 1) {
    // "Bachelor's" among "Bachelor's Degree" and "Bachelor's Degree (Honours)": take the plain one
    // only when it is just the wanted words plus a generic word like "degree". Otherwise never guess.
    const plain = startsWith.filter((option) => /^(degree|diploma|program(me)?|level)?$/.test(normalize(option).slice(target.length).trim()));
    return plain.length === 1 ? plain[0]! : null;
  }

  const contains = options.filter((option) => normalize(option).includes(target));
  if (contains.length === 1) return contains[0]!;
  if (contains.length > 1) return null;

  const fuse = new Fuse(options.map((text) => ({ text, norm: normalize(text) })), { keys: ['norm'], includeScore: true, threshold: 0.3 });
  const best = fuse.search(target)[0];
  return best && (best.score ?? 1) <= 0.3 ? best.item.text : null;
}
