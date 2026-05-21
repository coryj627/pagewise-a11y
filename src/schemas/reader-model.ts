import { z } from 'zod';
import { NodeRefIdSchema } from './node-ref';

const ReaderSectionSchema = z.object({
  heading: z.string().max(120),
  level: z.number().int().min(1).max(6),
  kind: z.enum([
    'prose',
    'list',
    'data_table',
    'form_summary',
    'media_summary',
    'navigation_summary',
    'metadata',
    'interactive_region',
  ]),
  source_node_ref_ids: z.array(NodeRefIdSchema).min(1),
  content_policy: z.enum(['render_text', 'summarize_only', 'jump_only']),
  content_summary: z.string().max(400).optional(),
});

const RemovedKindSchema = z.enum([
  'ads',
  'related_articles',
  'social_share',
  'comments',
  'footer_nav',
  'cookie_banner',
  'newsletter_signup',
  'tracking_iframes',
  'duplicate_nav',
]);

export const ReaderModelSchema = z.object({
  title: z.string().max(160),
  sections: z.array(ReaderSectionSchema),
  removed: z.array(RemovedKindSchema).optional(),
});

export type ReaderModel = z.infer<typeof ReaderModelSchema>;

/**
 * Anthropic tool definition matching {@link ReaderModelSchema}. Keep this
 * in sync with the Zod schema above.
 */
export const readerStructureTool = {
  name: 'reader_structure',
  description:
    'Emit a clean, sanitized, inert representation of the page main content.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: 160 },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            heading: { type: 'string', maxLength: 120 },
            level: { type: 'integer', minimum: 1, maximum: 6 },
            kind: {
              type: 'string',
              enum: [
                'prose',
                'list',
                'data_table',
                'form_summary',
                'media_summary',
                'navigation_summary',
                'metadata',
                'interactive_region',
              ],
            },
            source_node_ref_ids: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
            },
            content_policy: {
              type: 'string',
              enum: ['render_text', 'summarize_only', 'jump_only'],
            },
            content_summary: { type: 'string', maxLength: 400 },
          },
          required: [
            'heading',
            'level',
            'kind',
            'source_node_ref_ids',
            'content_policy',
          ],
        },
      },
      removed: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'ads',
            'related_articles',
            'social_share',
            'comments',
            'footer_nav',
            'cookie_banner',
            'newsletter_signup',
            'tracking_iframes',
            'duplicate_nav',
          ],
        },
      },
    },
    required: ['title', 'sections'],
  },
} as const;
