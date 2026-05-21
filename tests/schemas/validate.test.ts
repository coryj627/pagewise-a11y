import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validateToolOutput } from '@/schemas/validate';
import { OrientationModelSchema, type NodeRef } from '@/schemas';

const EXTRACTION_ID = '22222222-2222-4222-8222-222222222222';

function makeRef(id: string): NodeRef {
  return {
    id,
    extraction_id: EXTRACTION_ID,
    frame_ref: 'top',
    selector_hints: {},
    hashes: { role: 'generic' },
  };
}

describe('validateToolOutput', () => {
  it('returns ok=false when schema parse fails', () => {
    const result = validateToolOutput(
      z.object({ x: z.number() }),
      { x: 'not a number' },
      () => null
    );
    expect(result.ok).toBe(false);
  });

  it('keeps node_ref_ids that resolve and reports zero dropped', () => {
    const refs = new Map<string, NodeRef>([['n_aaaaa', makeRef('n_aaaaa')]]);
    const orientation = {
      page_type: 'article',
      page_scope: 'main_content_only',
      one_line_summary: 'Test',
      confidence: 0.9,
      key_facts: [],
      primary_actions: [{ label: 'Read', node_ref_id: 'n_aaaaa', kind: 'link' }],
      jump_list: [{ label: 'Main', node_ref_id: 'n_aaaaa', priority: 1 }],
    };

    const result = validateToolOutput(
      OrientationModelSchema,
      orientation,
      (id) => refs.get(id) ?? null
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dropped_refs).toBe(0);
      expect(result.value.primary_actions[0]?.node_ref_id).toBe('n_aaaaa');
      expect(result.value.jump_list[0]?.node_ref_id).toBe('n_aaaaa');
    }
  });

  it('drops unresolvable node_ref_ids and counts them', () => {
    const refs = new Map<string, NodeRef>([['n_aaaaa', makeRef('n_aaaaa')]]);
    const orientation = {
      page_type: 'article',
      page_scope: 'main_content_only',
      one_line_summary: 'Test',
      confidence: 0.9,
      key_facts: [],
      primary_actions: [
        { label: 'Real', node_ref_id: 'n_aaaaa', kind: 'link' },
        { label: 'Fake', node_ref_id: 'n_fffff', kind: 'link' },
      ],
      jump_list: [
        { label: 'Real', node_ref_id: 'n_aaaaa', priority: 1 },
        { label: 'Also fake', node_ref_id: 'n_eeeee', priority: 2 },
      ],
    };

    const result = validateToolOutput(
      OrientationModelSchema,
      orientation,
      (id) => refs.get(id) ?? null
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dropped_refs).toBe(2);
      // The unresolvable IDs were removed from their containers entirely.
      const actionRefs = result.value.primary_actions.map((a) => a.node_ref_id);
      const jumpRefs = result.value.jump_list.map((j) => j.node_ref_id);
      expect(actionRefs).not.toContain('n_fffff');
      expect(jumpRefs).not.toContain('n_eeeee');
      expect(actionRefs).toContain('n_aaaaa');
      expect(jumpRefs).toContain('n_aaaaa');
    }
  });

  it('walks nested arrays and objects', () => {
    const refs = new Map<string, NodeRef>();
    const result = validateToolOutput(
      z.object({
        nested: z.object({
          deep: z.array(
            z.object({ node_ref_id: z.string(), other: z.string() })
          ),
        }),
      }),
      {
        nested: {
          deep: [
            { node_ref_id: 'n_missing', other: 'a' },
            { node_ref_id: 'n_missing', other: 'b' },
          ],
        },
      },
      (id) => refs.get(id) ?? null
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dropped_refs).toBe(2);
    }
  });

  it('does not crash on null and primitive values', () => {
    const result = validateToolOutput(
      z.object({ a: z.null(), b: z.string(), c: z.number() }),
      { a: null, b: 'hi', c: 42 },
      () => null
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dropped_refs).toBe(0);
      expect(result.value).toEqual({ a: null, b: 'hi', c: 42 });
    }
  });
});
