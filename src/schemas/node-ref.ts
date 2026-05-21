import { z } from 'zod';

/**
 * Opaque per-extraction identifier for a DOM element. The most important
 * contract in the codebase: see docs/plans/architecture.md §7.
 *
 * Wrong jumps destroy trust faster than any other failure mode, which is why
 * `NodeRef` is a structured object with re-resolution hints rather than a
 * bare selector string.
 */
export const NodeRefSchema = z.object({
  /** Format: "n_" + 5+ hex chars. */
  id: z.string().regex(/^n_[0-9a-f]{5,}$/),

  /** UUID of the PageModel generation that produced this ref. */
  extraction_id: z.string().uuid(),

  /** Frame identity. "top" for the top frame; otherwise a stable child-frame ID. */
  frame_ref: z.string().min(1),

  /** Hints used by the re-resolution algorithm when the live element is gone. */
  selector_hints: z.object({
    css: z.string().optional(),
    xpath: z.string().optional(),
    aria: z
      .object({
        role: z.string().optional(),
        name: z.string().optional(),
      })
      .optional(),
    nearby_text: z.string().max(160).optional(),
    ordinal_path: z.array(z.number().int().min(0)).max(20).optional(),
  }),

  /** Content hashes used to verify resolution candidates. */
  hashes: z.object({
    role: z.string(),
    name_hash: z.string().optional(),
    text_hash: z.string().optional(),
  }),

  /** Position info, used for visual-order computations and resolution tie-breaking. */
  bbox: z
    .object({
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
    })
    .optional(),
});

export type NodeRef = z.infer<typeof NodeRefSchema>;

/**
 * The bare ID string Claude tool outputs use. The renderer joins it back to
 * a full {@link NodeRef} via the RefRegistry. Tool outputs stay lean by
 * passing IDs only.
 */
export const NodeRefIdSchema = NodeRefSchema.shape.id;
export type NodeRefId = z.infer<typeof NodeRefIdSchema>;

export const RefResolutionMethodSchema = z.enum([
  'exact',
  'hint_match',
  'fallback',
  'failed',
]);
export type RefResolutionMethod = z.infer<typeof RefResolutionMethodSchema>;

export const RefResolutionSchema = z.object({
  ref: NodeRefSchema,
  method: RefResolutionMethodSchema,
  confidence: z.number().min(0).max(1),
});

export type RefResolution = z.infer<typeof RefResolutionSchema>;
