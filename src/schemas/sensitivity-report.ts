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

export type PageClassification = z.infer<typeof PageClassificationSchema>;

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

export type RedactionKind = z.infer<typeof RedactionKindSchema>;

export const RedactionActionSchema = z.enum(['omitted', 'masked', 'summarized']);
export type RedactionAction = z.infer<typeof RedactionActionSchema>;

export const RedactionSchema = z.object({
  ref: NodeRefSchema,
  kind: RedactionKindSchema,
  action: RedactionActionSchema,
});

export type Redaction = z.infer<typeof RedactionSchema>;

export const SensitivityReportSchema = z.object({
  page_classification: PageClassificationSchema,
  redactions: z.array(RedactionSchema),
  url_path_redacted: z.boolean(),
});

export type SensitivityReport = z.infer<typeof SensitivityReportSchema>;
