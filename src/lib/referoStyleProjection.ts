import { z } from "zod";
import { serializeReferenceRecordForPrompt } from "./referenceRecordPrompt";

const StringArraySchema = z.array(z.string());

const TypeScaleEntrySchema = z.union([
  z.string(),
  z.object({
    role: z.string().optional(),
    name: z.string().optional(),
    size: z.string().optional(),
    lineHeight: z.string().optional(),
    letterSpacing: z.string().optional(),
  }),
]);

/**
 * The bounded, style-only subset of a Refero record that token synthesis can
 * use. Zod's default object behavior strips unknown fields deliberately.
 */
export const ReferoStyleProjectionSchema = z
  .object({
    title: z.string().min(1).optional(),
    northStar: z.string().optional(),
    theme: z.string().optional(),
    description: z.string().min(1).optional(),
    colors: z
      .array(
        z.object({
          hex: z.string().optional(),
          name: z.string().optional(),
          role: z.string().optional(),
          group: z.string().optional(),
        })
      )
      .optional(),
    typography: z
      .array(
        z.object({
          role: z.string().optional(),
          sizes: z.string().optional(),
          family: z.string().optional(),
          source: z.string().optional(),
          weight: z.string().optional(),
          lineHeight: z.string().optional(),
          substitute: z.string().optional(),
          letterSpacing: z.string().optional(),
        })
      )
      .optional(),
    typeScale: z.array(TypeScaleEntrySchema).optional(),
    spacing: z
      .object({
        radius: z.record(z.string(), z.string()).optional(),
        density: z.string().optional(),
        baseUnit: z.string().optional(),
        elementGap: z.string().optional(),
        sectionGap: z.string().optional(),
        cardPadding: z.string().optional(),
        pageMaxWidth: z.string().optional(),
      })
      .optional(),
    surfaces: z
      .array(
        z.object({
          hex: z.string().optional(),
          name: z.string().optional(),
          level: z.number().optional(),
          purpose: z.string().optional(),
        })
      )
      .optional(),
    components: z
      .array(
        z.object({
          name: z.string().optional(),
          role: z.string().optional(),
          description: z.string().optional(),
        })
      )
      .optional(),
    layout: z.string().optional(),
    imagery: z.string().optional(),
    dos: StringArraySchema.optional(),
    donts: StringArraySchema.optional(),
    customSections: z
      .array(
        z.object({
          title: z.string().optional(),
          content: z.string().optional(),
        })
      )
      .optional(),
  })
  .transform((record) => ({
    ...record,
    customSections: record.customSections?.filter(
      (section) => !/agent prompt guide/i.test(section.title ?? "")
    ),
  }));

const STYLE_PROMPT_CAP = 32_000;

type Projection = z.infer<typeof ReferoStyleProjectionSchema>;

function hasStyleContent(data: Projection): boolean {
  return Boolean(data.colors || data.typography || data.surfaces || data.spacing || data.typeScale);
}

/** Shrink by dropping whole late-value sections, never by cutting mid-token —
 * a hard slice can leave broken JSON in the prompt (review finding). */
function boundedProjectionJson(data: Projection): string | undefined {
  const reductions: Array<(current: Projection) => Projection> = [
    (current) => current,
    (current) => ({ ...current, customSections: undefined }),
    (current) => ({ ...current, customSections: undefined, components: undefined }),
    (current) => ({
      ...current,
      customSections: undefined,
      components: undefined,
      typeScale: undefined,
      dos: undefined,
      donts: undefined,
    }),
  ];
  for (const reduce of reductions) {
    const json = JSON.stringify(reduce(data));
    if (json.length <= STYLE_PROMPT_CAP) return json;
  }
  return undefined;
}

/**
 * Project style records before prompt serialization. Screens, malformed
 * styles, and pathological oversize preserve the established 24k fallback
 * behavior.
 */
export function projectReferenceRecordForPrompt(record: unknown): string {
  const projection = ReferoStyleProjectionSchema.safeParse(record);
  if (!projection.success || !hasStyleContent(projection.data)) {
    return serializeReferenceRecordForPrompt(record);
  }
  return boundedProjectionJson(projection.data) ?? serializeReferenceRecordForPrompt(record);
}
