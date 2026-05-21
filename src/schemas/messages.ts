import { z } from 'zod';
import { PageModelSchema } from './page-model';
import { PageCapabilityReportSchema } from './capability-report';
import { SensitivityReportSchema } from './sensitivity-report';
import { NodeRefSchema, RefResolutionMethodSchema } from './node-ref';

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
    method: RefResolutionMethodSchema,
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
