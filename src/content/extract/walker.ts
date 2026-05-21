import type { PageElement } from '@/schemas/page-element';
import type { NodeRef } from '@/schemas/node-ref';
import { RefRegistry } from '../refs/registry';
import { hashName, hashText, NodeIdGenerator } from '../refs/hash';
import { computeName } from '../dom-accessibility/compute-name';
import { computeRole } from '../dom-accessibility/compute-role';
import { isHidden } from '../dom-accessibility/hiddenness';

/**
 * Tags whose subtree we never include in the extracted model. They're
 * either non-content (script/style/meta) or platform infrastructure
 * (template). They're omitted before any other check so we never
 * accidentally hash or register them.
 */
const SKIP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'meta',
  'link',
  'head',
  'base',
  'title',
]);

/**
 * Heading tags whose level we capture on the PageElement.
 */
const HEADING_LEVELS: Record<string, number> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

export interface ExtractTreeOptions {
  /** UUID for this extraction. Generated when omitted. */
  extractionId?: string;
  /** Window for getComputedStyle. Defaults to the element's owner window. */
  view?: Window;
  /** Frame identity. Defaults to "top". */
  frameRef?: string;
}

export interface ExtractTreeResult {
  /** The PageElement tree rooted at the input element. */
  root: PageElement;
  /** Registry populated with every captured element. */
  registry: RefRegistry;
  /** UUID identifying this extraction. */
  extractionId: string;
}

interface WalkContext {
  registry: RefRegistry;
  ids: NodeIdGenerator;
  extractionId: string;
  view: Window | null;
  frameRef: string;
}

/**
 * Walk a DOM subtree and produce a {@link PageElement} tree plus a
 * {@link RefRegistry} mapping every captured element to its assigned
 * {@link NodeRef.id}. The walker skips hidden subtrees and non-content
 * tags (script/style/etc.) entirely — those elements never receive a ref.
 */
export function extractTree(
  rootElement: Element,
  options: ExtractTreeOptions = {}
): ExtractTreeResult {
  const extractionId = options.extractionId ?? generateUuid();
  const view = options.view ?? rootElement.ownerDocument?.defaultView ?? null;
  const registry = new RefRegistry(extractionId);
  const ctx: WalkContext = {
    registry,
    ids: new NodeIdGenerator(),
    extractionId,
    view,
    frameRef: options.frameRef ?? 'top',
  };

  const root = walk(rootElement, ctx);
  if (root === null) {
    throw new Error(
      `extractTree: root element <${rootElement.tagName.toLowerCase()}> is hidden or non-content`
    );
  }

  return { root, registry, extractionId };
}

function walk(element: Element, ctx: WalkContext): PageElement | null {
  const tag = element.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return null;
  if (isHidden(element, ctx.view)) return null;

  const { role, source: roleSource } = computeRole(element);
  const { name, source: nameSource } = computeName(element);
  const text = directTextContent(element);

  const children: PageElement[] = [];
  for (const child of Array.from(element.children)) {
    const childEl = walk(child, ctx);
    if (childEl !== null) children.push(childEl);
  }

  const id = ctx.ids.next();
  const ref: NodeRef = {
    id,
    extraction_id: ctx.extractionId,
    frame_ref: ctx.frameRef,
    selector_hints: buildHints(element, name),
    hashes: {
      role,
      name_hash: hashName(name),
      text_hash: hashText(text),
    },
    ...(maybeBbox(element) ?? {}),
  };
  ctx.registry.set(id, element);

  const pageElement: PageElement = {
    ref,
    tag,
    role,
    role_source: roleSource,
    children,
  };

  if (name !== '') {
    pageElement.name = name;
    pageElement.name_source = nameSource;
  }
  if (text !== '') {
    pageElement.text = text;
  }
  const level = HEADING_LEVELS[tag];
  if (level !== undefined) {
    pageElement.level = level;
  }
  if ((tag === 'a' || tag === 'area') && element.hasAttribute('href')) {
    pageElement.href = element.getAttribute('href') ?? undefined;
  }

  return pageElement;
}

/**
 * Direct text content: only the text node children of this element, joined
 * and normalized. Descendant text belongs to descendant PageElements.
 */
function directTextContent(element: Element): string {
  let s = '';
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      s += node.nodeValue ?? '';
    }
  }
  return s.replace(/\s+/g, ' ').trim();
}

function buildHints(
  element: Element,
  accessibleName: string
): NodeRef['selector_hints'] {
  const role = element.getAttribute('role') ?? undefined;
  const hints: NodeRef['selector_hints'] = {
    css: cssSelectorFor(element),
    xpath: xpathFor(element),
    aria:
      role !== undefined || accessibleName !== ''
        ? {
            ...(role !== undefined ? { role } : {}),
            ...(accessibleName !== '' ? { name: accessibleName } : {}),
          }
        : undefined,
  };
  return hints;
}

/**
 * Short CSS selector. Prefers `#id`; otherwise composes a tag chain with
 * nth-of-type indices up to the document body. Not guaranteed unique
 * forever (CSS selectors are brittle), but sufficient as a re-resolution
 * hint that gets verified against role + name_hash.
 */
function cssSelectorFor(element: Element): string {
  if (element.id !== '') {
    return `#${cssEscape(element.id)}`;
  }
  const parts: string[] = [];
  let cur: Element | null = element;
  const doc = element.ownerDocument;
  while (cur !== null && cur !== doc.documentElement) {
    const tag = cur.tagName.toLowerCase();
    const parent: Element | null = cur.parentElement;
    if (parent === null) {
      parts.unshift(tag);
      break;
    }
    const siblings = Array.from(parent.children).filter(
      (c) => c.tagName === cur!.tagName
    );
    if (siblings.length > 1) {
      const index = siblings.indexOf(cur) + 1;
      parts.unshift(`${tag}:nth-of-type(${index})`);
    } else {
      parts.unshift(tag);
    }
    cur = parent;
  }
  return parts.join(' > ');
}

function xpathFor(element: Element): string {
  const parts: string[] = [];
  let cur: Element | null = element;
  while (cur !== null && cur.nodeType === 1 /* ELEMENT_NODE */) {
    const tag = cur.tagName.toLowerCase();
    const parent: Element | null = cur.parentElement;
    if (parent === null) {
      parts.unshift(`/${tag}`);
      break;
    }
    const siblings = Array.from(parent.children).filter(
      (c) => c.tagName === cur!.tagName
    );
    const index = siblings.indexOf(cur) + 1;
    parts.unshift(`/${tag}[${index}]`);
    cur = parent;
  }
  return parts.join('');
}

function cssEscape(s: string): string {
  // Use CSS.escape when available (browser + jsdom); otherwise basic fallback.
  type CSSWithEscape = { escape(s: string): string };
  const css: unknown = (globalThis as { CSS?: unknown }).CSS;
  if (typeof css === 'object' && css !== null && 'escape' in css) {
    return (css as CSSWithEscape).escape(s);
  }
  return s.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}

function maybeBbox(element: Element): { bbox: NodeRef['bbox'] } | undefined {
  if (typeof element.getBoundingClientRect !== 'function') return undefined;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0 && rect.x === 0 && rect.y === 0) {
    // Layout not available (jsdom, hidden, etc.) — skip bbox entirely.
    return undefined;
  }
  return {
    bbox: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
  };
}

/**
 * UUID generator. Prefers the platform `crypto.randomUUID()` (available in
 * Chrome and jsdom 22+); falls back to a Math.random-based v4 generator if
 * unavailable. The fallback is only used in non-secure-context environments
 * and is acceptable here because extraction_id is for routing, not security.
 */
function generateUuid(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID !== undefined) return g.crypto.randomUUID();
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  const r = new Uint8Array(16);
  for (let i = 0; i < 16; i++) r[i] = Math.floor(Math.random() * 256);
  r[6] = (r[6]! & 0x0f) | 0x40;
  r[8] = (r[8]! & 0x3f) | 0x80;
  const h = Array.from(r, hex);
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
}
