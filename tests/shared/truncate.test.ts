import { describe, expect, it } from 'vitest';
import {
  truncatePageModel,
  estimatePageModelTokens,
  DEFAULT_PAGEMODEL_TOKEN_BUDGET,
} from '@/shared/truncate';
import type { PageModel } from '@/schemas/page-model';
import type { PageElement } from '@/schemas/page-element';
import type { PageCapabilityReport } from '@/schemas/capability-report';
import type { NodeRef } from '@/schemas/node-ref';

const EXTRACTION = '11111111-1111-4111-8111-111111111111';

function ref(id: string, role = 'generic'): NodeRef {
  return {
    id,
    extraction_id: EXTRACTION,
    frame_ref: 'top',
    selector_hints: {},
    hashes: { role },
  };
}

function leaf(id: string, text: string): PageElement {
  return {
    ref: ref(id, 'paragraph'),
    tag: 'p',
    role: 'paragraph',
    role_source: 'native',
    text,
    children: [],
  };
}

function chain(depth: number, prefix: string, makeText: (i: number) => string): PageElement {
  let acc: PageElement = leaf(`${prefix}_${depth}`, makeText(depth));
  for (let i = depth - 1; i >= 0; i--) {
    acc = {
      ref: ref(`${prefix}_${i}`),
      tag: 'div',
      role: 'generic',
      role_source: 'inferred',
      children: [acc],
    };
  }
  return acc;
}

function pageModelWith(main: PageElement): PageModel {
  return {
    schema_version: 2,
    extraction_id: EXTRACTION,
    url_origin: 'https://example.com',
    url_path_shape: '/',
    title: 'Test',
    extracted_at: '2026-05-22T00:00:00.000Z',
    content_hash: 'h',
    page_state: 'normal',
    landmarks: [
      {
        ref: ref('n_nav', 'navigation'),
        tag: 'nav',
        role: 'navigation',
        role_source: 'native',
        children: [],
      },
    ],
    main_content: main,
    interaction_surface: {
      forms: [
        {
          ref: ref('n_form', 'form'),
          tag: 'form',
          role: 'form',
          role_source: 'native',
          children: [],
        },
      ],
      primary_buttons: [],
      search_inputs: [],
    },
    deterministic_candidates: [ref('n_main', 'main')],
  };
}

const EMPTY_CAPABILITY: PageCapabilityReport = {
  extraction_quality: 'good',
  reasons: [],
  counts: {
    text_nodes: 0,
    headings: 0,
    landmarks: 0,
    links: 0,
    buttons: 0,
    form_controls: 0,
    images_without_alt: 0,
    frames_accessible: 0,
    frames_inaccessible: 0,
  },
};

describe('truncatePageModel', () => {
  it('returns the model untouched when already within budget', () => {
    const small = pageModelWith({
      ref: ref('n_main', 'main'),
      tag: 'main',
      role: 'main',
      role_source: 'native',
      children: [leaf('n_p1', 'Hello world.')],
    });
    const result = truncatePageModel(small, EMPTY_CAPABILITY, 10_000);
    expect(result.truncated).toBe(false);
    expect(result.pageModel).toBe(small);
    expect(result.capability).toBe(EMPTY_CAPABILITY);
  });

  it('depth-limits main_content when over budget; landmarks + interaction surface preserved', () => {
    // Build a deep, text-heavy main_content that blows past a small budget.
    const giant = chain(12, 'd', (i) => 'x'.repeat(2000) + ` depth=${i}`);
    const model = pageModelWith(giant);
    expect(estimatePageModelTokens(model)).toBeGreaterThan(1000);

    const result = truncatePageModel(model, EMPTY_CAPABILITY, 1000);
    expect(result.truncated).toBe(true);
    expect(result.strategy).toMatch(/limit_main_content_depth_|main_content_stripped/);
    expect(estimatePageModelTokens(result.pageModel)).toBeLessThanOrEqual(1000);

    // Landmarks + interaction_surface + deterministic_candidates untouched.
    expect(result.pageModel.landmarks).toBe(model.landmarks);
    expect(result.pageModel.interaction_surface).toBe(model.interaction_surface);
    expect(result.pageModel.deterministic_candidates).toBe(
      model.deterministic_candidates
    );
  });

  it('records large_page_truncated in capability.reasons + truncation.applied', () => {
    const giant = chain(10, 'd', (i) => 'x'.repeat(2000) + ` ${i}`);
    const result = truncatePageModel(
      pageModelWith(giant),
      EMPTY_CAPABILITY,
      500
    );
    expect(result.capability.reasons).toContain('large_page_truncated');
    expect(result.capability.truncation?.applied).toBe(true);
    expect(result.capability.truncation?.strategy).toBe(result.strategy);
    expect(result.capability.truncation?.omitted_sections).toBeGreaterThan(0);
  });

  it('does not duplicate large_page_truncated when already present', () => {
    const giant = chain(10, 'd', (i) => 'x'.repeat(2000) + ` ${i}`);
    const cap: PageCapabilityReport = {
      ...EMPTY_CAPABILITY,
      reasons: ['large_page_truncated'],
    };
    const result = truncatePageModel(pageModelWith(giant), cap, 500);
    const count = result.capability.reasons.filter(
      (r) => r === 'large_page_truncated'
    ).length;
    expect(count).toBe(1);
  });

  it('falls all the way back to main_content_stripped_to_root when even depth 1 is too big', () => {
    // Single huge text node that itself exceeds the budget — depth-limiting
    // can't help; we still report the strategy honestly.
    const huge: PageElement = {
      ref: ref('n_main', 'main'),
      tag: 'main',
      role: 'main',
      role_source: 'native',
      text: 'x'.repeat(50_000),
      children: [],
    };
    const result = truncatePageModel(pageModelWith(huge), EMPTY_CAPABILITY, 100);
    expect(result.truncated).toBe(true);
    // Even after stripping main's children we may still be over budget;
    // the strategy makes that explicit.
    expect(result.capability.truncation?.applied).toBe(true);
  });

  it('exports a sane DEFAULT_PAGEMODEL_TOKEN_BUDGET', () => {
    expect(DEFAULT_PAGEMODEL_TOKEN_BUDGET).toBeGreaterThan(10_000);
    expect(DEFAULT_PAGEMODEL_TOKEN_BUDGET).toBeLessThan(200_000);
  });
});
