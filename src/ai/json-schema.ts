import { z } from 'zod';

// JSON Schema words the AI providers don't accept. `default` only matters to zod (we fill
// defaults ourselves after the answer comes back) and `$schema` is just a version label.
const UNSUPPORTED_KEYWORDS = new Set(['$schema', 'default']);

/** Turns a zod schema into a JSON Schema the AI can follow. The zod schema stays the single source of truth. */
export function toAiJsonSchema(schema: z.ZodType): object {
  // io: 'output' describes the finished shape, so every field is listed as required
  // and the model is pushed to answer every field ('' / null / [] when empty).
  return stripKeywords(z.toJSONSchema(schema, { io: 'output' })) as object;
}

function stripKeywords(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripKeywords);
  if (node === null || typeof node !== 'object') return node;
  const nullable = asNullableType(node as Record<string, unknown>);
  if (nullable) return stripKeywords(nullable);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    // Under `properties`, keys are field names (a field could be called "default"), so keep them all.
    out[key] = key === 'properties' ? mapValues(value as Record<string, unknown>) : stripKeywords(value);
  }
  return out;
}

function mapValues(properties: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(properties).map(([name, value]) => [name, stripKeywords(value)]));
}

// zod writes "string or null" as { anyOf: [{ type: 'string' }, { type: 'null' }] }.
// Gemini's docs use the simpler { type: ['string', 'null'] }, so rewrite it that way.
function asNullableType(node: Record<string, unknown>): Record<string, unknown> | null {
  const options = node.anyOf;
  if (!Array.isArray(options) || options.length !== 2) return null;
  const isNull = (option: { type?: unknown }) => option?.type === 'null';
  const nullOption = options.find(isNull);
  const other = options.find((option) => !isNull(option)) as Record<string, unknown> | undefined;
  if (!nullOption || !other || typeof other.type !== 'string') return null;

  const { anyOf: _anyOf, ...rest } = node; // keep e.g. `default`/`description` from the outer node
  const merged: Record<string, unknown> = { ...rest, ...other, type: [other.type, 'null'] };
  if (Array.isArray(other.enum)) merged.enum = [...other.enum, null];
  return merged;
}
