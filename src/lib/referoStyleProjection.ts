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
  .superRefine((record, context) => {
    if (record.title || record.description) return;
    context.addIssue({
      code: "custom",
      path: ["title"],
      message: "style projections require a title or description",
    });
  })
  .transform((record) => ({
    ...record,
    customSections: record.customSections?.filter(
      (section) => !/agent prompt guide/i.test(section.title ?? "")
    ),
  }));

const STYLE_PROMPT_CAP = 32_000;

/**
 * Project style records before prompt serialization. Screens and malformed
 * styles preserve the established 24k fallback behavior.
 */
export function projectReferenceRecordForPrompt(record: unknown): string {
  const projection = ReferoStyleProjectionSchema.safeParse(record);
  if (!projection.success || (!projection.data.colors && !projection.data.typography)) {
    return serializeReferenceRecordForPrompt(record);
  }
  return JSON.stringify(projection.data).slice(0, STYLE_PROMPT_CAP);
}
