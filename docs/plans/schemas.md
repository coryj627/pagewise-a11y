# Schemas

All shared Zod schemas for the Pagewise codebase. These are the contracts between the content script, service worker, side panel, and Claude API.

Every schema lives in `src/schemas/` and is imported by both contexts. Validation runs at every trust boundary:

- Messages between extension surfaces (Zod-parsed on receipt).
- Claude tool outputs (Zod-parsed before any rendering).
- `PageModel` stored in `chrome.storage.session` (Zod-parsed on read).

If validation fails, the data is rejected and a structured error is surfaced. We never render unvalidated content.

---

## Conventions

- All schemas use Zod (`z`).
- All schemas export both the Zod schema (`FooSchema`) and the inferred TypeScript type (`Foo`).
- Schemas referenced across files import the schema, not just the type.
- Open enums (categories that may grow) include `'other'` as a final option.
- Optional fields use `.optional()` rather than `.nullable()` to keep JSON output free of nulls.
- Max lengths and item caps are enforced — they're not just suggestions to the model; they're enforced on parse.

---

## `node-ref.ts`

The `NodeRef` is the most important contract in the codebase. See `architecture.md` §7.

```ts
import { z } from 'zod';

export const NodeRefSchema = z.object({
  /** Opaque per-extraction ID. Format: "n_" + 5+ hex chars. */
  id: z.string().regex(/^n_[0-9a-f]{5,}$/),

  /** UUID of the PageModel generation that produced this ref. */
  extraction_id: z.string().uuid(),

  /** Frame identity. "top" for the top frame; otherwise a stable child-frame ID. */
  frame_ref: z.string().min(1),

  /** Hints used by the re-resolution algorithm when the live element is gone. */
  selector_hints: z.object({
    css: z.string().optional(),
    xpath: z.string().optional(),
    aria: z.object({
      role: z.string().optional(),
      name: z.string().optional(),
    }).optional(),
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
  bbox: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }).optional(),
});

export type NodeRef = z.infer<typeof NodeRefSchema>;

/**
 * A "node_ref_id" is the bare ID string used in Claude tool outputs.
 * The renderer joins it back to a full NodeRef via the RefRegistry.
 * We keep tool outputs lean by passing IDs only.
 */
export const NodeRefIdSchema = NodeRefSchema.shape.id;
export type NodeRefId = z.infer<typeof NodeRefIdSchema>;
```

### Resolution result

```ts
export const RefResolutionSchema = z.object({
  ref: NodeRefSchema,
  method: z.enum(['exact', 'hint_match', 'fallback', 'failed']),
  confidence: z.number().min(0).max(1),
});

export type RefResolution = z.infer<typeof RefResolutionSchema>;
```

---

## `page-element.ts`

```ts
import { z } from 'zod';
import { NodeRefSchema } from './node-ref';

const StateSchema = z.object({
  expanded: z.boolean().optional(),
  checked: z.boolean().optional(),
  selected: z.boolean().optional(),
  disabled: z.boolean().optional(),
  current: z.boolean().optional(),
  invalid: z.boolean().optional(),
  busy: z.boolean().optional(),
}).optional();

const FormControlSchema = z.object({
  type: z.string(),
  label: z.string().optional(),
  required: z.boolean().optional(),
  // NOTE: `value` is intentionally never captured by default.
  // Per-domain opt-in for value capture is a Phase 2 feature.
}).optional();

const ImageSchema = z.object({
  src_origin: z.string().optional(), // origin only, not full URL
  alt: z.string().optional(),
  decorative: z.boolean().optional(),
}).optional();

const RelationshipsSchema = z.object({
  labelled_by: z.array(z.string()).optional(),  // ref IDs
  described_by: z.array(z.string()).optional(),
  controls: z.array(z.string()).optional(),
  owns: z.array(z.string()).optional(),
  heading_path: z.array(z.string()).optional(),
  landmark: z.string().optional(),
}).optional();

const SensitivitySchema = z.object({
  level: z.enum(['none', 'low', 'medium', 'high']),
  reasons: z.array(z.string()),
  redacted: z.boolean(),
}).optional();

/**
 * Recursive shape. Zod requires a type annotation for recursion.
 */
export type PageElement = {
  ref: z.infer<typeof NodeRefSchema>;
  tag: string;
  role: string;
  role_source: 'native' | 'aria' | 'inferred';
  name?: string;
  name_source?: 'aria-label' | 'aria-labelledby' | 'label' | 'text' | 'title' | 'alt' | 'none';
  description?: string;
  text?: string;
  level?: number;
  state?: z.infer<typeof StateSchema>;
  href?: string;
  external?: boolean;
  form_control?: z.infer<typeof FormControlSchema>;
  image?: z.infer<typeof ImageSchema>;
  relationships?: z.infer<typeof RelationshipsSchema>;
  layout?: {
    bbox?: { x: number; y: number; w: number; h: number };
    visual_order?: number;
  };
  sensitivity?: z.infer<typeof SensitivitySchema>;
  children: PageElement[];
};

export const PageElementSchema: z.ZodType<PageElement> = z.lazy(() =>
  z.object({
    ref: NodeRefSchema,
    tag: z.string(),
    role: z.string(),
    role_source: z.enum(['native', 'aria', 'inferred']),
    name: z.string().optional(),
    name_source: z.enum([
      'aria-label', 'aria-labelledby', 'label', 'text', 'title', 'alt', 'none',
    ]).optional(),
    description: z.string().optional(),
    text: z.string().optional(),
    level: z.number().int().min(1).max(6).optional(),
    state: StateSchema,
    href: z.string().optional(),
    external: z.boolean().optional(),
    form_control: FormControlSchema,
    image: ImageSchema,
    relationships: RelationshipsSchema,
    layout: z.object({
      bbox: z.object({
        x: z.number(), y: z.number(), w: z.number(), h: z.number(),
      }).optional(),
      visual_order: z.number().int().min(0).optional(),
    }).optional(),
    sensitivity: SensitivitySchema,
    children: z.array(PageElementSchema),
  })
);
```

---

## `page-model.ts`

```ts
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
   * Deterministically pre-ranked candidate jump targets.
   * Claude is given these and asked to rank/label them; it should
   * not invent jump targets that aren't in this list, though it
   * may select a subset.
   */
  deterministic_candidates: z.array(NodeRefSchema),
});

export type PageModel = z.infer<typeof PageModelSchema>;
```

---

## `capability-report.ts`

```ts
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

export const PageCapabilityReportSchema = z.object({
  extraction_quality: z.enum(['good', 'partial', 'poor', 'blocked']),
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
  truncation: z.object({
    applied: z.boolean(),
    strategy: z.string().optional(),
    omitted_sections: z.number().int().min(0).optional(),
  }).optional(),
});

export type PageCapabilityReport = z.infer<typeof PageCapabilityReportSchema>;
```

---

## `sensitivity-report.ts`

```ts
import { z } from 'zod';
import { NodeRefSchema } from './node-ref';

export const PageClassificationSchema = z.enum([
  'public_likely',
  'authenticated_likely',
  'personal_data_likely',
  'financial_likely',
  'health_likely',
  'credential_likely',
  'unknown',
]);

export const RedactionKindSchema = z.enum([
  'password',
  'credit_card',
  'email',
  'phone',
  'address',
  'token_like',
  'long_identifier',
  'form_value',
  'contenteditable',
  'sensitive_domain',
]);

export const RedactionActionSchema = z.enum(['omitted', 'masked', 'summarized']);

export const RedactionSchema = z.object({
  ref: NodeRefSchema,
  kind: RedactionKindSchema,
  action: RedactionActionSchema,
});

export const SensitivityReportSchema = z.object({
  page_classification: PageClassificationSchema,
  redactions: z.array(RedactionSchema),
  url_path_redacted: z.boolean(),
});

export type SensitivityReport = z.infer<typeof SensitivityReportSchema>;
export type Redaction = z.infer<typeof RedactionSchema>;
```

---

## `orientation-model.ts`

The Claude `summarize_page` tool output. See `architecture.md` §8.1.

```ts
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
  kind: z.enum([
    'main_content', 'form', 'results', 'filters',
    'navigation', 'table', 'media', 'warning', 'other',
  ]).optional(),
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
    'article', 'product_detail', 'search_results', 'listing',
    'form', 'dashboard', 'landing_page', 'documentation',
    'social_feed', 'login', 'checkout', 'media_player',
    'error_page', 'other',
  ]),
  page_scope: z.enum([
    'full_page', 'main_content_only', 'viewport_only', 'partial',
  ]),
  one_line_summary: z.string().max(160),
  confidence: z.number().min(0).max(1),
  source_coverage: z.object({
    text: z.enum(['high', 'medium', 'low']),
    visual: z.enum(['none', 'partial', 'screenshot_used']),
  }).optional(),
  key_facts: z.array(KeyFactSchema).max(6),
  primary_actions: z.array(PrimaryActionSchema).max(5),
  jump_list: z.array(JumpListItemSchema).max(10),
  warnings: z.array(WarningSchema).optional(),
});

export type OrientationModel = z.infer<typeof OrientationModelSchema>;
```

### Anthropic tool definition (matching `input_schema`)

```ts
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
          'article', 'product_detail', 'search_results', 'listing',
          'form', 'dashboard', 'landing_page', 'documentation',
          'social_feed', 'login', 'checkout', 'media_player',
          'error_page', 'other',
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
          visual: { type: 'string', enum: ['none', 'partial', 'screenshot_used'] },
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
            kind: { type: 'string', enum: ['explicit', 'inferred', 'counted', 'visual'] },
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
            kind: { type: 'string', enum: ['button', 'link', 'form', 'input'] },
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
                'main_content', 'form', 'results', 'filters',
                'navigation', 'table', 'media', 'warning', 'other',
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
                'login_required', 'paywall', 'broken_structure',
                'mostly_images', 'autoplay_media', 'cookie_wall',
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
      'page_type', 'page_scope', 'one_line_summary',
      'confidence', 'key_facts', 'primary_actions', 'jump_list',
    ],
  },
} as const;
```

---

## `reader-model.ts`

The Claude `reader_structure` tool output. See `architecture.md` §8.2.

```ts
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
                'prose', 'list', 'data_table', 'form_summary',
                'media_summary', 'navigation_summary', 'metadata',
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
            'heading', 'level', 'kind',
            'source_node_ref_ids', 'content_policy',
          ],
        },
      },
      removed: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'ads', 'related_articles', 'social_share', 'comments',
            'footer_nav', 'cookie_banner', 'newsletter_signup',
            'tracking_iframes', 'duplicate_nav',
          ],
        },
      },
    },
    required: ['title', 'sections'],
  },
} as const;
```

---

## `qa-model.ts`

The Claude `answer_question` tool output. See `architecture.md` §8.3.

```ts
import { z } from 'zod';
import { NodeRefIdSchema } from './node-ref';

const QAReferenceSchema = z.object({
  node_ref_id: NodeRefIdSchema,
  relevance: z.enum(['primary', 'supporting', 'context']),
  relevance_reason: z.string().max(200).optional(),
});

export const QAModelSchema = z.object({
  answer: z.string().max(800),
  answer_found: z.boolean(),
  not_found_reason: z.enum([
    'not_on_page',
    'login_required',
    'page_partially_inaccessible',
    'too_ambiguous',
    'sensitive_content_blocked',
  ]).optional(),
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
}).refine(
  (data) => !data.answer_found || data.references.length > 0,
  {
    message: 'references must be non-empty when answer_found is true',
    path: ['references'],
  }
);

export type QAModel = z.infer<typeof QAModelSchema>;

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
          'not_on_page', 'login_required',
          'page_partially_inaccessible', 'too_ambiguous',
          'sensitive_content_blocked',
        ],
      },
      answer_type: {
        type: 'string',
        enum: [
          'direct_fact', 'summary', 'comparison',
          'instruction', 'inference', 'not_found',
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
            relevance: { type: 'string', enum: ['primary', 'supporting', 'context'] },
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
```

---

## `messages.ts`

Cross-surface message schemas. Validate on receipt in every direction.

```ts
import { z } from 'zod';
import { PageModelSchema } from './page-model';
import { PageCapabilityReportSchema } from './capability-report';
import { SensitivityReportSchema } from './sensitivity-report';
import { NodeRefSchema, NodeRefIdSchema } from './node-ref';

// ─────────────────────────────────────────────────────────
// content script → service worker
// ─────────────────────────────────────────────────────────

export const ContentToServiceMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('page_extracted'),
    tabId: z.number().int(),
    frameId: z.number().int(),
    url_origin: z.string().url(),
    content_hash: z.string(),
    model: PageModelSchema,
    capability: PageCapabilityReportSchema,
    sensitivity: SensitivityReportSchema,
  }),
  z.object({
    type: z.literal('extract_error'),
    tabId: z.number().int(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal('jump_resolved'),
    tabId: z.number().int(),
    nodeRef: NodeRefSchema,
    method: z.enum(['exact', 'hint_match', 'fallback', 'failed']),
  }),
]);

export type ContentToServiceMessage = z.infer<typeof ContentToServiceMessageSchema>;

// ─────────────────────────────────────────────────────────
// side panel → service worker
// ─────────────────────────────────────────────────────────

export const PanelToServiceMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('request_extract'),
    tabId: z.number().int(),
  }),
  z.object({
    type: z.literal('request_jump'),
    tabId: z.number().int(),
    nodeRef: NodeRefSchema,
  }),
  z.object({
    type: z.literal('subscribe_tab'),
    tabId: z.number().int(),
  }),
]);

export type PanelToServiceMessage = z.infer<typeof PanelToServiceMessageSchema>;

// ─────────────────────────────────────────────────────────
// service worker → side panel
// ─────────────────────────────────────────────────────────

export const ServiceToPanelMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('extract_ready'),
    tabId: z.number().int(),
    model: PageModelSchema,
    capability: PageCapabilityReportSchema,
    sensitivity: SensitivityReportSchema,
  }),
  z.object({
    type: z.literal('extract_unavailable'),
    tabId: z.number().int(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal('tab_navigated'),
    tabId: z.number().int(),
  }),
]);

export type ServiceToPanelMessage = z.infer<typeof ServiceToPanelMessageSchema>;

// ─────────────────────────────────────────────────────────
// service worker → content script
// ─────────────────────────────────────────────────────────

export const ServiceToContentMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('extract_now'),
  }),
  z.object({
    type: z.literal('scroll_to'),
    nodeRef: NodeRefSchema,
    highlight: z.boolean().default(false),
  }),
]);

export type ServiceToContentMessage = z.infer<typeof ServiceToContentMessageSchema>;
```

---

## Validation helpers

A small utility for the side panel's "validate Claude output, drop unresolvable refs, announce" pattern.

```ts
// src/schemas/validate.ts
import { z } from 'zod';
import type { NodeRef } from './node-ref';

export type ValidationResult<T> =
  | { ok: true; value: T; dropped_refs: number }
  | { ok: false; error: z.ZodError };

export function validateToolOutput<T>(
  schema: z.ZodType<T>,
  input: unknown,
  resolveRef: (id: string) => NodeRef | null
): ValidationResult<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error };

  // Walk the parsed object and check every node_ref_id we find.
  let dropped = 0;
  const visit = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) {
        if (k === 'node_ref_id' && typeof val === 'string') {
          if (resolveRef(val) === null) {
            dropped++;
            continue; // drop this ref entirely from its container
          }
        }
        out[k] = visit(val);
      }
      return out;
    }
    return v;
  };

  const cleaned = visit(parsed.data) as T;
  return { ok: true, value: cleaned, dropped_refs: dropped };
}
```

The renderer uses this:

```ts
const result = validateToolOutput(
  OrientationModelSchema,
  toolUse.input,
  (id) => refRegistry.get(id)
);
if (!result.ok) {
  showError('Pagewise received a malformed response. Try again.');
  return;
}
if (result.dropped_refs > 0) {
  announce(`Note: ${result.dropped_refs} references were invalid and dropped.`);
}
render(result.value);
```

---

## Index

```ts
// src/schemas/index.ts
export * from './node-ref';
export * from './page-element';
export * from './page-model';
export * from './capability-report';
export * from './sensitivity-report';
export * from './orientation-model';
export * from './reader-model';
export * from './qa-model';
export * from './messages';
export * from './validate';
```
