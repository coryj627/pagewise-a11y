import { z } from 'zod';
import { NodeRefIdSchema } from './node-ref';

const QAReferenceSchema = z.object({
  node_ref_id: NodeRefIdSchema,
  relevance: z.enum(['primary', 'supporting', 'context']),
  relevance_reason: z.string().max(200).optional(),
});

export const QAModelSchema = z
  .object({
    answer: z.string().max(800),
    answer_found: z.boolean(),
    not_found_reason: z
      .enum([
        'not_on_page',
        'login_required',
        'page_partially_inaccessible',
        'too_ambiguous',
        'sensitive_content_blocked',
      ])
      .optional(),
    answer_type: z.enum([
      'direct_fact',
      'summary',
      'comparison',
      'instruction',
      'inference',
      'not_found',
    ]),
    confidence: z.number().min(0).max(1),
    references: z.array(QAReferenceSchema).max(5).default([]),
    suggested_followups: z.array(z.string().max(120)).max(3).default([]),
  })
  .refine((data) => !data.answer_found || data.references.length > 0, {
    message: 'references must be non-empty when answer_found is true',
    path: ['references'],
  });

export type QAModel = z.infer<typeof QAModelSchema>;

/**
 * Anthropic tool definition matching {@link QAModelSchema}. Keep this in
 * sync with the Zod schema above.
 */
export const answerQuestionTool = {
  name: 'answer_question',
  description:
    'Answer a user question about the page with anchors back to source content.',
  input_schema: {
    type: 'object',
    properties: {
      answer: { type: 'string', maxLength: 800 },
      answer_found: { type: 'boolean' },
      not_found_reason: {
        type: 'string',
        enum: [
          'not_on_page',
          'login_required',
          'page_partially_inaccessible',
          'too_ambiguous',
          'sensitive_content_blocked',
        ],
      },
      answer_type: {
        type: 'string',
        enum: [
          'direct_fact',
          'summary',
          'comparison',
          'instruction',
          'inference',
          'not_found',
        ],
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      references: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            node_ref_id: { type: 'string' },
            relevance: {
              type: 'string',
              enum: ['primary', 'supporting', 'context'],
            },
            relevance_reason: { type: 'string', maxLength: 200 },
          },
          required: ['node_ref_id', 'relevance'],
        },
      },
      suggested_followups: {
        type: 'array',
        maxItems: 3,
        items: { type: 'string', maxLength: 120 },
      },
    },
    required: ['answer', 'answer_found', 'answer_type', 'confidence'],
  },
} as const;
