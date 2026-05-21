import { describe, expect, it } from 'vitest';
import {
  detectElementSensitivity,
  classifyPage,
} from '@/content/extract/sensitivity';

function el(html: string): Element {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
}

describe('detectElementSensitivity', () => {
  it('flags input[type=password]', () => {
    expect(detectElementSensitivity(el('<input type="password" />'))).toEqual({
      kind: 'password',
    });
  });

  it('flags autocomplete=current-password / new-password', () => {
    expect(
      detectElementSensitivity(
        el('<input type="text" autocomplete="current-password" />')
      )
    ).toEqual({ kind: 'password' });
    expect(
      detectElementSensitivity(
        el('<input type="text" autocomplete="new-password" />')
      )
    ).toEqual({ kind: 'password' });
  });

  it('flags cc-* autocomplete as credit_card', () => {
    expect(
      detectElementSensitivity(el('<input autocomplete="cc-number" />'))
    ).toEqual({ kind: 'credit_card' });
    expect(
      detectElementSensitivity(el('<input autocomplete="cc-exp-month" />'))
    ).toEqual({ kind: 'credit_card' });
    expect(
      detectElementSensitivity(el('<input autocomplete="cc-csc" />'))
    ).toEqual({ kind: 'credit_card' });
  });

  it('flags input[type=email] and autocomplete=email', () => {
    expect(detectElementSensitivity(el('<input type="email" />'))).toEqual({
      kind: 'email',
    });
    expect(
      detectElementSensitivity(el('<input type="text" autocomplete="email" />'))
    ).toEqual({ kind: 'email' });
  });

  it('flags input[type=tel] and autocomplete=tel*', () => {
    expect(detectElementSensitivity(el('<input type="tel" />'))).toEqual({
      kind: 'phone',
    });
    expect(
      detectElementSensitivity(el('<input type="text" autocomplete="tel" />'))
    ).toEqual({ kind: 'phone' });
    expect(
      detectElementSensitivity(
        el('<input type="text" autocomplete="tel-national" />')
      )
    ).toEqual({ kind: 'phone' });
  });

  it('flags address autocomplete attributes', () => {
    for (const ac of ['street-address', 'address-line1', 'postal-code', 'country']) {
      expect(
        detectElementSensitivity(el(`<input autocomplete="${ac}" />`))
      ).toEqual({ kind: 'address' });
    }
  });

  it('flags contenteditable elements with non-empty content', () => {
    expect(
      detectElementSensitivity(el('<div contenteditable="true">Note</div>'))
    ).toEqual({ kind: 'contenteditable' });
    expect(
      detectElementSensitivity(el('<div contenteditable>Note</div>'))
    ).toEqual({ kind: 'contenteditable' });
  });

  it('does NOT flag empty contenteditable', () => {
    expect(
      detectElementSensitivity(el('<div contenteditable="true"></div>'))
    ).toBeNull();
  });

  it('does NOT flag contenteditable="false"', () => {
    expect(
      detectElementSensitivity(el('<div contenteditable="false">x</div>'))
    ).toBeNull();
  });

  it('returns null for ordinary inputs and elements', () => {
    expect(detectElementSensitivity(el('<input type="text" />'))).toBeNull();
    expect(detectElementSensitivity(el('<div>hello</div>'))).toBeNull();
    expect(detectElementSensitivity(el('<button>click</button>'))).toBeNull();
  });
});

describe('classifyPage', () => {
  it('returns public_likely when there are no hits and no sensitive host', () => {
    expect(classifyPage({ hits: [] })).toBe('public_likely');
    expect(classifyPage({ hits: [], host: 'wikipedia.org' })).toBe('public_likely');
  });

  it('promotes to credential_likely on any password hit', () => {
    expect(classifyPage({ hits: [{ kind: 'password' }] })).toBe('credential_likely');
    // Other hits do not downgrade.
    expect(
      classifyPage({ hits: [{ kind: 'password' }, { kind: 'email' }] })
    ).toBe('credential_likely');
  });

  it('promotes to financial_likely on credit_card hit', () => {
    expect(classifyPage({ hits: [{ kind: 'credit_card' }] })).toBe(
      'financial_likely'
    );
  });

  it('promotes to financial_likely on banking/brokerage/payment domain', () => {
    expect(classifyPage({ hits: [], host: 'chase.com' })).toBe('financial_likely');
    expect(classifyPage({ hits: [], host: 'fidelity.com' })).toBe(
      'financial_likely'
    );
    expect(classifyPage({ hits: [], host: 'paypal.com' })).toBe(
      'financial_likely'
    );
  });

  it('promotes to health_likely on health domain', () => {
    expect(classifyPage({ hits: [], host: 'mychart.com' })).toBe('health_likely');
  });

  it('promotes to personal_data_likely on government/tax domain', () => {
    expect(classifyPage({ hits: [], host: 'irs.gov' })).toBe('personal_data_likely');
    expect(classifyPage({ hits: [], host: 'turbotax.com' })).toBe(
      'personal_data_likely'
    );
  });

  it('promotes to personal_data_likely on email/phone/address/contenteditable hits', () => {
    for (const kind of ['email', 'phone', 'address', 'contenteditable'] as const) {
      expect(classifyPage({ hits: [{ kind }] })).toBe('personal_data_likely');
    }
  });

  it('password beats domain classification', () => {
    expect(
      classifyPage({ hits: [{ kind: 'password' }], host: 'mychart.com' })
    ).toBe('credential_likely');
  });
});
