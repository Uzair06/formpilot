import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toAiJsonSchema } from '@/src/ai/json-schema';
import { ResumeProfileSchema } from '@/src/profile/resume';

// Keywords Gemini's structured output supports (ai.google.dev/gemini-api/docs/structured-output).
const ALLOWED = new Set([
  'type', 'properties', 'required', 'additionalProperties', 'items', 'prefixItems', 'minItems', 'maxItems',
  'enum', 'format', 'minimum', 'maximum', 'anyOf', 'title', 'description',
]);

function keywordsOf(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((child) => keywordsOf(child, found));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      found.add(key);
      if (key === 'properties') Object.values(value as object).forEach((child) => keywordsOf(child, found));
      else keywordsOf(value, found);
    }
  }
  return found;
}

describe('toAiJsonSchema', () => {
  it('only uses keywords the AI supports', () => {
    const unsupported = [...keywordsOf(toAiJsonSchema(ResumeProfileSchema))].filter((key) => !ALLOWED.has(key));
    expect(unsupported).toEqual([]);
  });

  it('marks every field as required so the model answers all of them', () => {
    const schema = toAiJsonSchema(ResumeProfileSchema) as { required: string[] };
    expect(schema.required).toEqual(Object.keys(ResumeProfileSchema.shape));
  });

  it('writes "or null" as a type list, the way Gemini documents it', () => {
    const schema = toAiJsonSchema(
      z.object({
        month: z.number().int().min(1).max(12).nullable().default(null),
        kind: z.enum(['a', 'b']).nullable(),
        start: z.object({ year: z.number() }).nullable(),
      }),
    ) as { properties: Record<string, unknown> };
    expect(schema.properties.month).toEqual({ type: ['integer', 'null'], minimum: 1, maximum: 12 });
    expect(schema.properties.kind).toEqual({ type: ['string', 'null'], enum: ['a', 'b', null] });
    expect(schema.properties.start).toEqual({
      type: ['object', 'null'],
      properties: { year: { type: 'number' } },
      required: ['year'],
      additionalProperties: false,
    });
  });

  it('leaves no anyOf in the resume schema', () => {
    expect(keywordsOf(toAiJsonSchema(ResumeProfileSchema)).has('anyOf')).toBe(false);
  });

  it('keeps a field that happens to be named "default"', () => {
    const schema = toAiJsonSchema(z.object({ default: z.string().default('x') })) as { properties: object };
    expect(schema.properties).toEqual({ default: { type: 'string' } });
  });
});
