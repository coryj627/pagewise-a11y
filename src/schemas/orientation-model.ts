import { z } from 'zod';
import { NodeRefIdSchema } from './node-ref';

const KeyFactSchema = z.object({
  text: z.string().max(200),
  source_node_ref_ids: z.array(NodeRefIdSchema).default([]),
  kind: z.enum(['explicit', 'inferred', 'counted', 'visual']),
  confidence: z.number().min(0).max(1),
});

const PrimaryActionSchema = z.object({
  label: z.string().max(60),
  node_ref_id: NodeRefIdSchema,
  kind: z.enum(['button', 'link', 'form', 'input']),
  reason: z.string().max(120).optional(),
});

const JumpListItemSchema = z.object({
  label: z.string().max(60),
  node_ref_id: NodeRefIdSchema,
  description: z.string().max(120).optional(),
  priority: z.number().int().min(1).max(10),
  kind: z
    .enum([
      'main_content',
      'form',
      'results',
      'filters',
      'navigation',
      'table',
      'media',
      'warning',
      'other',
    ])
    .optional(),
});

const WarningSchema = z.object({
  kind: z.enum([
    'login_required',
    'paywall',
    'broken_structure',
    'mostly_images',
    'autoplay_media',
    'cookie_wall',
    'modal_blocking',
  ]),
  detail: z.string().max(200).optional(),
});

export const OrientationModelSchema = z.object({
  page_type: z.enum([
    'article',
    'product_detail',
    'search_results',
    'listing',
    'form',
    'dashboard',
    'landing_page',
    'documentation',
    'social_feed',
    'login',
    'checkout',
    'media_player',
    'error_page',
    'other',
  ]),
  page_scope: z.enum(['full_page', 'main_content_only', 'viewport_only', 'partial']),
  one_line_summary: z.string().max(160),
  confidence: z.number().min(0).max(1),
  source_coverage: z
    .object({
      text: z.enum(['high', 'medium', 'low']),
      visual: z.enum(['none', 'partial', 'screenshot_used']),
    })
    .optional(),
  key_facts: z.array(KeyFactSchema).max(6),
  primary_actions: z.array(PrimaryActionSchema).max(5),
  jump_list: z.array(JumpListItemSchema).max(10),
  warnings: z.array(WarningSchema).optional(),
});

export type OrientationModel = z.infer<typeof OrientationModelSchema>;

/**
 * Anthropic tool definition matching {@link OrientationModelSchema}. The
 * `input_schema` is plain JSON Schema (not Zod) because that's what the
 * Anthropic API accepts. Keep this in sync with the Zod schema above.
 */
export const summarizePageTool = {
  name: 'summarize_page',
  description:
    'Produce orientation for a page: what it is, what is on it, what to do next.',
  input_schema: {
    type: 'object',
    properties: {
      page_type: {
        type: 'string',
        enum: [
          'article',
          'product_detail',
          'search_results',
          'listing',
          'form',
          'dashboard',
          'landing_page',
          'documentation',
          'social_feed',
          'login',
          'checkout',
          'media_player',
          'error_page',
          'other',
        ],
      },
      page_scope: {
        type: 'string',
        enum: ['full_page', 'main_content_only', 'viewport_only', 'partial'],
      },
      one_line_summary: { type: 'string', maxLength: 160 },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      source_coverage: {
        type: 'object',
        properties: {
          text: { type: 'string', enum: ['high', 'medium', 'low'] },
          visual: {
            type: 'string',
            enum: ['none', 'partial', 'screenshot_used'],
          },
        },
      },
      key_facts: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', maxLength: 200 },
            source_node_ref_ids: { type: 'array', items: { type: 'string' } },
            kind: {
              type: 'string',
              enum: ['explicit', 'inferred', 'counted', 'visual'],
            },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['text', 'kind', 'confidence'],
        },
      },
      primary_actions: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', maxLength: 60 },
            node_ref_id: { type: 'string' },
            kind: {
              type: 'string',
              enum: ['button', 'link', 'form', 'input'],
            },
            reason: { type: 'string', maxLength: 120 },
          },
          required: ['label', 'node_ref_id', 'kind'],
        },
      },
      jump_list: {
        type: 'array',
        maxItems: 10,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', maxLength: 60 },
            node_ref_id: { type: 'string' },
            description: { type: 'string', maxLength: 120 },
            priority: { type: 'integer', minimum: 1, maximum: 10 },
            kind: {
              type: 'string',
              enum: [
                'main_content',
                'form',
                'results',
                'filters',
                'navigation',
                'table',
                'media',
                'warning',
                'other',
              ],
            },
          },
          required: ['label', 'node_ref_id', 'priority'],
        },
      },
      warnings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: [
                'login_required',
                'paywall',
                'broken_structure',
                'mostly_images',
                'autoplay_media',
                'cookie_wall',
                'modal_blocking',
              ],
            },
            detail: { type: 'string', maxLength: 200 },
          },
          required: ['kind'],
        },
      },
    },
    required: [
      'page_type',
      'page_scope',
      'one_line_summary',
      'confidence',
      'key_facts',
      'primary_actions',
      'jump_list',
    ],
  },
} as const;
