import { describe, expect, it } from 'vitest';
import {
  NodeRefSchema,
  PageElementSchema,
  PageModelSchema,
  OrientationModelSchema,
  ReaderModelSchema,
  QAModelSchema,
  ContentToServiceMessageSchema,
  PanelToServiceMessageSchema,
  type NodeRef,
  type PageElement,
  type PageModel,
} from '@/schemas';

const EXTRACTION_ID = '11111111-1111-4111-8111-111111111111';

function makeNodeRef(overrides: Partial<NodeRef> = {}): NodeRef {
  return {
    id: 'n_abcde',
    extraction_id: EXTRACTION_ID,
    frame_ref: 'top',
    selector_hints: {},
    hashes: { role: 'button' },
    ...overrides,
  };
}

function makeElement(overrides: Partial<PageElement> = {}): PageElement {
  return {
    ref: makeNodeRef(),
    tag: 'div',
    role: 'generic',
    role_source: 'inferred',
    children: [],
    ...overrides,
  };
}

function makePageModel(overrides: Partial<PageModel> = {}): PageModel {
  return {
    schema_version: 2,
    extraction_id: EXTRACTION_ID,
    url_origin: 'https://example.com',
    url_path_shape: '/articles/:id',
    title: 'Sample article',
    extracted_at: '2026-05-21T12:34:56.000Z',
    content_hash: 'abc123',
    page_state: 'normal',
    landmarks: [],
    main_content: makeElement({ tag: 'main', role: 'main', role_source: 'native' }),
    interaction_surface: { forms: [], primary_buttons: [], search_inputs: [] },
    deterministic_candidates: [],
    ...overrides,
  };
}

describe('NodeRefSchema', () => {
  it('accepts a minimal valid ref', () => {
    expect(NodeRefSchema.safeParse(makeNodeRef()).success).toBe(true);
  });

  it('rejects an id that does not match n_<hex>', () => {
    expect(NodeRefSchema.safeParse(makeNodeRef({ id: 'node-1' })).success).toBe(false);
    expect(NodeRefSchema.safeParse(makeNodeRef({ id: 'n_xyz' })).success).toBe(false);
    expect(NodeRefSchema.safeParse(makeNodeRef({ id: 'n_abc' })).success).toBe(false);
  });

  it('rejects a non-UUID extraction_id', () => {
    expect(
      NodeRefSchema.safeParse(makeNodeRef({ extraction_id: 'not-a-uuid' })).success
    ).toBe(false);
  });

  it('rejects an empty frame_ref', () => {
    expect(NodeRefSchema.safeParse(makeNodeRef({ frame_ref: '' })).success).toBe(
      false
    );
  });

  it('accepts optional selector hints and bbox', () => {
    const ref = makeNodeRef({
      selector_hints: {
        css: 'main > article',
        xpath: '/html/body/main/article',
        aria: { role: 'article', name: 'Headline' },
        nearby_text: 'introduction',
        ordinal_path: [0, 2, 1],
      },
      bbox: { x: 0, y: 0, w: 800, h: 600 },
    });
    expect(NodeRefSchema.safeParse(ref).success).toBe(true);
  });
});

describe('PageElementSchema', () => {
  it('validates a recursive tree', () => {
    const tree = makeElement({
      tag: 'main',
      role: 'main',
      role_source: 'native',
      children: [
        makeElement({
          ref: makeNodeRef({ id: 'n_aaaaa' }),
          tag: 'h1',
          role: 'heading',
          role_source: 'native',
          level: 1,
          text: 'Hello',
        }),
        makeElement({
          ref: makeNodeRef({ id: 'n_bbbbb' }),
          tag: 'section',
          role: 'region',
          role_source: 'aria',
          children: [
            makeElement({
              ref: makeNodeRef({ id: 'n_ccccc' }),
              tag: 'p',
              role: 'paragraph',
              role_source: 'inferred',
              text: 'Body text',
            }),
          ],
        }),
      ],
    });

    expect(PageElementSchema.safeParse(tree).success).toBe(true);
  });

  it('rejects level > 6', () => {
    const bad = makeElement({ level: 7 });
    expect(PageElementSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown role_source', () => {
    const bad = { ...makeElement(), role_source: 'guess' };
    expect(PageElementSchema.safeParse(bad).success).toBe(false);
  });
});

describe('PageModelSchema', () => {
  it('round-trips a minimal valid model', () => {
    const model = makePageModel();
    const result = PageModelSchema.safeParse(model);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Sample article');
      expect(result.data.schema_version).toBe(2);
    }
  });

  it('rejects schema_version other than 2', () => {
    const bad = { ...makePageModel(), schema_version: 1 };
    expect(PageModelSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects non-URL url_origin', () => {
    expect(
      PageModelSchema.safeParse(makePageModel({ url_origin: 'not a url' })).success
    ).toBe(false);
  });

  it('rejects bad page_state enum', () => {
    const bad = { ...makePageModel(), page_state: 'broken' };
    expect(PageModelSchema.safeParse(bad).success).toBe(false);
  });
});

describe('OrientationModelSchema', () => {
  const validOrientation = {
    page_type: 'article',
    page_scope: 'main_content_only',
    one_line_summary: 'A short news article on accessibility.',
    confidence: 0.85,
    key_facts: [
      {
        text: 'Published 2026-05-21',
        kind: 'explicit',
        confidence: 0.9,
        source_node_ref_ids: ['n_aaaaa'],
      },
    ],
    primary_actions: [
      { label: 'Read article', node_ref_id: 'n_bbbbb', kind: 'link' },
    ],
    jump_list: [
      { label: 'Main content', node_ref_id: 'n_ccccc', priority: 1 },
    ],
  };

  it('accepts a minimal valid output', () => {
    expect(OrientationModelSchema.safeParse(validOrientation).success).toBe(true);
  });

  it('defaults source_node_ref_ids to []', () => {
    const minimalKeyFact = {
      ...validOrientation,
      key_facts: [{ text: 'Just a fact', kind: 'inferred', confidence: 0.5 }],
    };
    const parsed = OrientationModelSchema.parse(minimalKeyFact);
    expect(parsed.key_facts[0]?.source_node_ref_ids).toEqual([]);
  });

  it('rejects one_line_summary > 160 chars', () => {
    const bad = { ...validOrientation, one_line_summary: 'x'.repeat(161) };
    expect(OrientationModelSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects more than 10 jump_list items', () => {
    const bad = {
      ...validOrientation,
      jump_list: Array.from({ length: 11 }, (_, i) => ({
        label: `j${i}`,
        node_ref_id: `n_${i.toString(16).padStart(5, '0')}`,
        priority: 1,
      })),
    };
    expect(OrientationModelSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown page_type', () => {
    const bad = { ...validOrientation, page_type: 'video_game' };
    expect(OrientationModelSchema.safeParse(bad).success).toBe(false);
  });
});

describe('ReaderModelSchema', () => {
  it('accepts a minimal valid output', () => {
    const valid = {
      title: 'Article title',
      sections: [
        {
          heading: 'Intro',
          level: 2,
          kind: 'prose',
          source_node_ref_ids: ['n_aaaaa'],
          content_policy: 'render_text',
        },
      ],
    };
    expect(ReaderModelSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a section with empty source_node_ref_ids', () => {
    const bad = {
      title: 'Article',
      sections: [
        {
          heading: 'Empty',
          level: 2,
          kind: 'prose',
          source_node_ref_ids: [],
          content_policy: 'render_text',
        },
      ],
    };
    expect(ReaderModelSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown content_policy', () => {
    const bad = {
      title: 'Article',
      sections: [
        {
          heading: 'X',
          level: 2,
          kind: 'prose',
          source_node_ref_ids: ['n_aaaaa'],
          content_policy: 'rewrite',
        },
      ],
    };
    expect(ReaderModelSchema.safeParse(bad).success).toBe(false);
  });
});

describe('QAModelSchema', () => {
  it('accepts a valid answer_found=true response with references', () => {
    const valid = {
      answer: 'Returns within 30 days.',
      answer_found: true,
      answer_type: 'direct_fact',
      confidence: 0.95,
      references: [{ node_ref_id: 'n_aaaaa', relevance: 'primary' }],
    };
    expect(QAModelSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects answer_found=true with empty references', () => {
    const bad = {
      answer: 'Yes.',
      answer_found: true,
      answer_type: 'direct_fact',
      confidence: 0.9,
      references: [],
    };
    expect(QAModelSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts answer_found=false with empty references', () => {
    const valid = {
      answer: 'The page does not state the return policy.',
      answer_found: false,
      answer_type: 'not_found',
      not_found_reason: 'not_on_page',
      confidence: 0.7,
      references: [],
    };
    expect(QAModelSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects answer > 800 chars', () => {
    const bad = {
      answer: 'x'.repeat(801),
      answer_found: false,
      answer_type: 'not_found',
      confidence: 0.5,
    };
    expect(QAModelSchema.safeParse(bad).success).toBe(false);
  });
});

describe('cross-surface messages', () => {
  it('discriminates ContentToService by `type`', () => {
    const ok = ContentToServiceMessageSchema.safeParse({
      type: 'jump_resolved',
      tabId: 7,
      nodeRef: makeNodeRef(),
      method: 'exact',
    });
    expect(ok.success).toBe(true);
  });

  it('rejects an unknown message type', () => {
    const bad = ContentToServiceMessageSchema.safeParse({
      type: 'mystery',
      tabId: 1,
    });
    expect(bad.success).toBe(false);
  });

  it('validates PanelToService request_jump shape', () => {
    const ok = PanelToServiceMessageSchema.safeParse({
      type: 'request_jump',
      tabId: 7,
      nodeRef: makeNodeRef(),
    });
    expect(ok.success).toBe(true);
  });
});
