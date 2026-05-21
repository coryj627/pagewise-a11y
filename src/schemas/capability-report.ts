import { z } from 'zod';

export const CapabilityReasonSchema = z.enum([
  'no_main_region',
  'mostly_images',
  'canvas_content',
  'virtualized_list',
  'cross_origin_frames',
  'closed_shadow_dom',
  'login_required',
  'sensitive_page',
  'large_page_truncated',
]);

export type CapabilityReason = z.infer<typeof CapabilityReasonSchema>;

export const ExtractionQualitySchema = z.enum(['good', 'partial', 'poor', 'blocked']);
export type ExtractionQuality = z.infer<typeof ExtractionQualitySchema>;

export const PageCapabilityReportSchema = z.object({
  extraction_quality: ExtractionQualitySchema,
  reasons: z.array(CapabilityReasonSchema),
  counts: z.object({
    text_nodes: z.number().int().min(0),
    headings: z.number().int().min(0),
    landmarks: z.number().int().min(0),
    links: z.number().int().min(0),
    buttons: z.number().int().min(0),
    form_controls: z.number().int().min(0),
    images_without_alt: z.number().int().min(0),
    frames_accessible: z.number().int().min(0),
    frames_inaccessible: z.number().int().min(0),
  }),
  truncation: z
    .object({
      applied: z.boolean(),
      strategy: z.string().optional(),
      omitted_sections: z.number().int().min(0).optional(),
    })
    .optional(),
});

export type PageCapabilityReport = z.infer<typeof PageCapabilityReportSchema>;
