import type { PageElement } from '@/schemas/page-element';
import type { PageModel, PageState } from '@/schemas/page-model';
import type { PageCapabilityReport } from '@/schemas/capability-report';
import type {
  SensitivityReport,
  Redaction,
} from '@/schemas/sensitivity-report';
import { extractTree } from './walker';
import { RefRegistry } from '../refs/registry';
import { hashPageElementTree } from '@/shared/content-hash';
import { redactUrlPath } from '@/shared/url-shape';
import {
  detectElementSensitivity,
  classifyPage,
  buildRedaction,
  buildSensitiveDomainRedaction,
} from './sensitivity';
import { pickDeterministicCandidates } from './pre-rank';

const LANDMARK_ROLES = new Set([
  'banner',
  'complementary',
  'contentinfo',
  'form',
  'main',
  'navigation',
  'region',
  'search',
]);

export interface ExtractPageModelOptions {
  extractionId?: string;
  /** Override "now". Useful for deterministic test snapshots. */
  now?: () => Date;
}

export interface ExtractPageModelResult {
  pageModel: PageModel;
  registry: RefRegistry;
  capability: PageCapabilityReport;
  sensitivity: SensitivityReport;
}

/**
 * End-to-end PageModel construction from a live document. Wraps the
 * walker, picks landmarks / main content / interaction surface, builds
 * the deterministic candidate list (see pre-rank.ts), computes a stable
 * content hash, and runs the per-element sensitivity check (see
 * sensitivity.ts) to produce a real SensitivityReport.
 */
export function extractPageModel(
  doc: Document,
  options: ExtractPageModelOptions = {}
): ExtractPageModelResult {
  const { root, registry, extractionId } = extractTree(doc.body, {
    ...(options.extractionId !== undefined
      ? { extractionId: options.extractionId }
      : {}),
  });
  const all = flatten(root);

  const landmarks = all.filter((el) => LANDMARK_ROLES.has(el.role));
  const main = landmarks.find((el) => el.role === 'main') ?? root;

  const forms = all.filter(
    (el) => el.role === 'form' || el.tag === 'form' || el.tag === 'fieldset'
  );
  const searchInputs = all.filter(
    (el) =>
      el.role === 'searchbox' ||
      (el.tag === 'input' && el.role === 'searchbox') ||
      el.role === 'search'
  );
  const primaryButtons = pickPrimaryButtons(all);

  const deterministicCandidates = pickDeterministicCandidates({
    root,
    main,
    landmarks,
    forms,
    searchInputs,
    primaryButtons,
    all,
  });

  const now = (options.now ?? (() => new Date()))();
  const win = doc.defaultView ?? globalThis.window ?? null;
  const url = win?.location ?? doc.location;
  const lang = doc.documentElement.getAttribute('lang') ?? undefined;
  const urlPathShape = redactUrlPath(url.pathname);
  const urlPathRedacted = urlPathShape !== url.pathname;

  const sensitivity = buildSensitivityReport({
    registry,
    refsById: buildRefIndex(root),
    rootRef: root.ref,
    host: url.hostname,
    urlPathRedacted,
  });

  const pageModel: PageModel = {
    schema_version: 2,
    extraction_id: extractionId,
    url_origin: url.origin,
    url_path_shape: urlPathShape,
    title: (doc.title ?? '').trim(),
    ...(lang !== undefined ? { lang } : {}),
    extracted_at: now.toISOString(),
    content_hash: hashPageElementTree(root),
    page_state: inferPageState(all),
    landmarks,
    main_content: main,
    interaction_surface: {
      forms,
      primary_buttons: primaryButtons,
      search_inputs: searchInputs,
    },
    deterministic_candidates: deterministicCandidates,
  };

  return {
    pageModel,
    registry,
    capability: buildCapabilityReport(all, root),
    sensitivity,
  };
}

function flatten(el: PageElement, out: PageElement[] = []): PageElement[] {
  out.push(el);
  for (const c of el.children) flatten(c, out);
  return out;
}

function pickPrimaryButtons(all: PageElement[]): PageElement[] {
  const buttons = all.filter(
    (el) =>
      (el.role === 'button' || el.role === 'link') &&
      el.name !== undefined &&
      el.name.length > 0
  );
  return buttons.slice(0, 5);
}

function inferPageState(all: PageElement[]): PageState {
  if (
    all.some((el) => el.role === 'dialog' && el.state?.expanded !== false)
  ) {
    return 'modal_blocked';
  }
  return 'normal';
}

function buildCapabilityReport(
  all: PageElement[],
  root: PageElement
): PageCapabilityReport {
  const counts = {
    text_nodes: all.filter((el) => el.text !== undefined && el.text !== '').length,
    headings: all.filter((el) => el.role === 'heading').length,
    landmarks: all.filter((el) => LANDMARK_ROLES.has(el.role)).length,
    links: all.filter((el) => el.role === 'link').length,
    buttons: all.filter((el) => el.role === 'button').length,
    form_controls: all.filter((el) =>
      [
        'textbox',
        'checkbox',
        'radio',
        'combobox',
        'listbox',
        'slider',
        'spinbutton',
        'searchbox',
      ].includes(el.role)
    ).length,
    images_without_alt: all.filter(
      (el) =>
        el.tag === 'img' &&
        (el.name === undefined || el.name === '') &&
        el.role !== 'presentation'
    ).length,
    frames_accessible: all.filter((el) => el.tag === 'iframe').length,
    frames_inaccessible: 0,
  };

  const reasons: PageCapabilityReport['reasons'] = [];
  if (all.find((el) => el.role === 'main') === undefined && root.tag === 'body') {
    reasons.push('no_main_region');
  }
  if (
    counts.text_nodes === 0 &&
    all.filter((el) => el.tag === 'img').length > 5
  ) {
    reasons.push('mostly_images');
  }

  const quality: PageCapabilityReport['extraction_quality'] = (() => {
    if (counts.text_nodes === 0) return 'poor';
    if (reasons.length > 0) return 'partial';
    return 'good';
  })();

  return {
    extraction_quality: quality,
    reasons,
    counts,
  };
}

function buildRefIndex(root: PageElement): Map<string, Redaction['ref']> {
  const out = new Map<string, Redaction['ref']>();
  const visit = (el: PageElement): void => {
    out.set(el.ref.id, el.ref);
    for (const c of el.children) visit(c);
  };
  visit(root);
  return out;
}

function buildSensitivityReport(args: {
  registry: RefRegistry;
  refsById: ReadonlyMap<string, Redaction['ref']>;
  rootRef: Redaction['ref'];
  host: string;
  urlPathRedacted: boolean;
}): SensitivityReport {
  const redactions: Redaction[] = [];

  for (const [refId, element] of args.registry.entries()) {
    const hit = detectElementSensitivity(element);
    if (hit === null) continue;
    const ref = args.refsById.get(refId);
    if (ref === undefined) continue; // registry/tree mismatch shouldn't happen
    redactions.push(buildRedaction(ref, hit));
  }

  const domainRedaction = buildSensitiveDomainRedaction(args.rootRef, args.host);
  if (domainRedaction !== null) redactions.push(domainRedaction);

  return {
    page_classification: classifyPage({
      hits: redactions.map(({ kind }) => ({ kind })),
      host: args.host,
    }),
    redactions,
    url_path_redacted: args.urlPathRedacted,
  };
}
