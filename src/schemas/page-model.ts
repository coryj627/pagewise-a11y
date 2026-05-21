import { z } from 'zod';
import { PageElementSchema } from './page-element';
import { NodeRefSchema } from './node-ref';

export const PageStateSchema = z.enum([
  'normal',
  'modal_blocked',
  'cookie_wall',
  'login_required',
  'paywall',
  'loading',
  'error',
]);

export type PageState = z.infer<typeof PageStateSchema>;

export const PageModelSchema = z.object({
  schema_version: z.literal(2),
  extraction_id: z.string().uuid(),
  url_origin: z.string().url(),

  /**
   * URL path shape with token-shaped segments redacted.
   * Example: "/orders/8c4f.../items" → "/orders/:id/items".
   */
  url_path_shape: z.string(),

  title: z.string(),
  lang: z.string().optional(),
  extracted_at: z.string().datetime(),
  content_hash: z.string(),

  page_state: PageStateSchema,

  landmarks: z.array(PageElementSchema),
  main_content: PageElementSchema,
  interaction_surface: z.object({
    forms: z.array(PageElementSchema),
    primary_buttons: z.array(PageElementSchema),
    search_inputs: z.array(PageElementSchema),
  }),

  /**
   * Deterministically pre-ranked candidate jump targets. Claude is given
   * these and asked to rank/label them; it should not invent jump targets
   * that aren't in this list, though it may select a subset.
   */
  deterministic_candidates: z.array(NodeRefSchema),
});

export type PageModel = z.infer<typeof PageModelSchema>;
