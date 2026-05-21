import { z } from 'zod';
import { NodeRefSchema } from './node-ref';

const StateSchema = z
  .object({
    expanded: z.boolean().optional(),
    checked: z.boolean().optional(),
    selected: z.boolean().optional(),
    disabled: z.boolean().optional(),
    current: z.boolean().optional(),
    invalid: z.boolean().optional(),
    busy: z.boolean().optional(),
  })
  .optional();

const FormControlSchema = z
  .object({
    type: z.string(),
    label: z.string().optional(),
    required: z.boolean().optional(),
    // `value` is intentionally never captured by default. Per-domain opt-in
    // for value capture is a Phase 2 feature.
  })
  .optional();

const ImageSchema = z
  .object({
    src_origin: z.string().optional(), // origin only, not full URL
    alt: z.string().optional(),
    decorative: z.boolean().optional(),
  })
  .optional();

const RelationshipsSchema = z
  .object({
    labelled_by: z.array(z.string()).optional(),
    described_by: z.array(z.string()).optional(),
    controls: z.array(z.string()).optional(),
    owns: z.array(z.string()).optional(),
    heading_path: z.array(z.string()).optional(),
    landmark: z.string().optional(),
  })
  .optional();

const SensitivityLevelSchema = z.enum(['none', 'low', 'medium', 'high']);

const ElementSensitivitySchema = z
  .object({
    level: SensitivityLevelSchema,
    reasons: z.array(z.string()),
    redacted: z.boolean(),
  })
  .optional();

const LayoutSchema = z
  .object({
    bbox: z
      .object({
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
      })
      .optional(),
    visual_order: z.number().int().min(0).optional(),
  })
  .optional();

/**
 * Recursive shape. Zod requires the type to be declared up-front so it can
 * be referenced inside the `z.lazy` factory.
 */
export type PageElement = {
  ref: z.infer<typeof NodeRefSchema>;
  tag: string;
  role: string;
  role_source: 'native' | 'aria' | 'inferred';
  name?: string;
  name_source?:
    | 'aria-label'
    | 'aria-labelledby'
    | 'label'
    | 'text'
    | 'title'
    | 'alt'
    | 'none';
  description?: string;
  text?: string;
  level?: number;
  state?: z.infer<typeof StateSchema>;
  href?: string;
  external?: boolean;
  form_control?: z.infer<typeof FormControlSchema>;
  image?: z.infer<typeof ImageSchema>;
  relationships?: z.infer<typeof RelationshipsSchema>;
  layout?: z.infer<typeof LayoutSchema>;
  sensitivity?: z.infer<typeof ElementSensitivitySchema>;
  children: PageElement[];
};

export const PageElementSchema: z.ZodType<PageElement> = z.lazy(() =>
  z.object({
    ref: NodeRefSchema,
    tag: z.string(),
    role: z.string(),
    role_source: z.enum(['native', 'aria', 'inferred']),
    name: z.string().optional(),
    name_source: z
      .enum(['aria-label', 'aria-labelledby', 'label', 'text', 'title', 'alt', 'none'])
      .optional(),
    description: z.string().optional(),
    text: z.string().optional(),
    level: z.number().int().min(1).max(6).optional(),
    state: StateSchema,
    href: z.string().optional(),
    external: z.boolean().optional(),
    form_control: FormControlSchema,
    image: ImageSchema,
    relationships: RelationshipsSchema,
    layout: LayoutSchema,
    sensitivity: ElementSensitivitySchema,
    children: z.array(PageElementSchema),
  })
);
