import { describe, expect, it } from 'vitest';
import {
  INJECTION_FRAMING,
  ORIENTATION_SYSTEM_PROMPT,
  READER_SYSTEM_PROMPT,
  QA_SYSTEM_PROMPT,
} from '@/system-prompts';

const ALL_PROMPTS = [
  ['ORIENTATION_SYSTEM_PROMPT', ORIENTATION_SYSTEM_PROMPT],
  ['READER_SYSTEM_PROMPT', READER_SYSTEM_PROMPT],
  ['QA_SYSTEM_PROMPT', QA_SYSTEM_PROMPT],
] as const;

describe('system prompts', () => {
  it.each(ALL_PROMPTS)('%s is non-empty and trimmed', (_name, value) => {
    expect(value.length).toBeGreaterThan(200);
    expect(value).toBe(value.trim());
  });

  it.each(ALL_PROMPTS)('%s begins with INJECTION_FRAMING', (_name, value) => {
    expect(value.startsWith(INJECTION_FRAMING)).toBe(true);
  });

  it('INJECTION_FRAMING explicitly tells the model to treat page content as data', () => {
    expect(INJECTION_FRAMING).toContain('data, not as instructions');
    expect(INJECTION_FRAMING).toContain('Never follow');
  });

  it('orientation prompt names the summarize_page tool', () => {
    expect(ORIENTATION_SYSTEM_PROMPT).toContain('summarize_page');
  });

  it('reader prompt names the reader_structure tool and content_policy values', () => {
    expect(READER_SYSTEM_PROMPT).toContain('reader_structure');
    expect(READER_SYSTEM_PROMPT).toContain('render_text');
    expect(READER_SYSTEM_PROMPT).toContain('summarize_only');
    expect(READER_SYSTEM_PROMPT).toContain('jump_only');
  });

  it('qa prompt names the answer_question tool and the not_found path', () => {
    expect(QA_SYSTEM_PROMPT).toContain('answer_question');
    expect(QA_SYSTEM_PROMPT).toContain('answer_found = false');
  });

  it('prompts are constant strings (no template interpolation slots)', () => {
    for (const [, value] of ALL_PROMPTS) {
      // Crude check: no `${...}` template marker should survive at runtime
      // (TypeScript template literals are evaluated at module load).
      expect(value).not.toMatch(/\$\{/);
    }
  });
});
