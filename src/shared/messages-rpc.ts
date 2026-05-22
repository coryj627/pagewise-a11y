/**
 * RPC-style request/response envelopes used between the side panel and
 * the per-tab content script (forwarded by the service worker). These
 * complement the broadcast cross-surface messages in src/schemas/messages.ts
 * by giving us a Promise-returning round-trip — the service worker
 * awaits the content script's response and forwards it back to the
 * caller in one shot.
 *
 * Defined as Zod schemas so both sides validate inputs and outputs at the
 * trust boundary.
 */
import { z } from 'zod';
import { PageModelSchema } from '@/schemas/page-model';
import { PageCapabilityReportSchema } from '@/schemas/capability-report';
import { SensitivityReportSchema } from '@/schemas/sensitivity-report';
import { NodeRefSchema } from '@/schemas/node-ref';

export const ExtractRequestSchema = z.object({
  type: z.literal('extract'),
});
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;

export const ExtractResponseSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ok'),
    model: PageModelSchema,
    capability: PageCapabilityReportSchema,
    sensitivity: SensitivityReportSchema,
  }),
  z.object({
    kind: z.literal('error'),
    reason: z.string(),
  }),
]);
export type ExtractResponse = z.infer<typeof ExtractResponseSchema>;

export const JumpRequestSchema = z.object({
  type: z.literal('jump'),
  nodeRef: NodeRefSchema,
});
export type JumpRequest = z.infer<typeof JumpRequestSchema>;

export const JumpResponseSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ok'),
    method: z.enum(['exact', 'hint_match', 'fallback']),
    confidence: z.number().min(0).max(1),
    element: z.object({
      role: z.string(),
      name: z.string(),
      tag: z.string(),
    }),
  }),
  z.object({
    kind: z.literal('error'),
    reason: z.string(),
  }),
]);
export type JumpResponse = z.infer<typeof JumpResponseSchema>;

export const ContentRpcRequestSchema = z.discriminatedUnion('type', [
  ExtractRequestSchema,
  JumpRequestSchema,
]);
export type ContentRpcRequest = z.infer<typeof ContentRpcRequestSchema>;

// ─────────────────────────────────────────────────────────
// Panel → service worker RPC (the SW routes by tabId).
// ─────────────────────────────────────────────────────────

export const PanelExtractRequestSchema = z.object({
  type: z.literal('panel:extract'),
  tabId: z.number().int(),
});
export type PanelExtractRequest = z.infer<typeof PanelExtractRequestSchema>;

export const PanelJumpRequestSchema = z.object({
  type: z.literal('panel:jump'),
  tabId: z.number().int(),
  nodeRef: NodeRefSchema,
});
export type PanelJumpRequest = z.infer<typeof PanelJumpRequestSchema>;

export const PanelRpcRequestSchema = z.discriminatedUnion('type', [
  PanelExtractRequestSchema,
  PanelJumpRequestSchema,
]);
export type PanelRpcRequest = z.infer<typeof PanelRpcRequestSchema>;

// ─────────────────────────────────────────────────────────
// Content → service worker push notifications (no response expected).
// The SW augments each with the sender tabId and re-broadcasts as a
// panel notification.
// ─────────────────────────────────────────────────────────

const PageChangeReasonSchema = z.enum([
  'dom_mutation',
  'url_pushstate',
  'url_replacestate',
  'url_popstate',
  'url_hashchange',
]);

export const ContentEventMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('content:pageChanged'),
    reason: PageChangeReasonSchema,
  }),
]);
export type ContentEventMessage = z.infer<typeof ContentEventMessageSchema>;

// ─────────────────────────────────────────────────────────
// Service worker → side panel broadcasts. The panel filters by tabId so
// it only reacts to events on its bound tab.
// ─────────────────────────────────────────────────────────

export const PanelNotificationMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('panel:pageChanged'),
    tabId: z.number().int(),
    reason: PageChangeReasonSchema,
  }),
]);
export type PanelNotificationMessage = z.infer<typeof PanelNotificationMessageSchema>;
