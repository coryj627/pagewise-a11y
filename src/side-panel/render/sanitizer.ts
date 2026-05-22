/**
 * HTML sanitizer for any content the renderer might display from a host
 * page. The renderer's hard rule (architecture.md §10.6): host-page
 * content NEVER reaches the side panel DOM except through this module.
 *
 * Approach:
 *   - Parse with DOMParser. DOMParser does NOT execute scripts or fetch
 *     subresources, so parsing alone is safe.
 *   - Walk the parsed tree. Drop dangerous tags entirely (script, iframe,
 *     svg, object, embed, style, link, meta, frame, frameset). Drop
 *     anything not on the caller's allow-list.
 *   - On kept elements, strip all attributes except a small per-tag
 *     allow-list (lang anywhere, href on <a> after URL sanitization).
 *   - On <a href> URLs, defer to {@link sanitizeUrl}.
 *   - External links get rel="noopener noreferrer" added defensively.
 *
 * The result is a {@link DocumentFragment} the renderer can append to its
 * own DOM, plus a `removed` array enumerating what was filtered (for
 * status-region announcements like "removed 3 iframes").
 */
import { sanitizeUrl } from '@/shared/url-sanitizer';

export type RemovedKind =
  | 'script'
  | 'iframe'
  | 'frame'
  | 'frameset'
  | 'svg'
  | 'math'
  | 'object'
  | 'embed'
  | 'style'
  | 'link'
  | 'meta'
  | 'base'
  | 'form'
  | 'input'
  | 'event_handler'
  | 'inline_style'
  | 'data_attr'
  | 'unknown_attr'
  | 'unknown_tag'
  | 'dangerous_url'
  | 'comment';

export interface SanitizeOptions {
  /**
   * Tag names the caller is willing to render. Anything else (including
   * dangerous tags) is dropped. Defaults to {@link DEFAULT_ALLOWED_TAGS}.
   */
  allowedTags?: ReadonlyArray<string>;
  /**
   * Origin of the host page the content came from. Used to detect cross-
   * origin links so the sanitizer can add rel="noopener noreferrer".
   */
  pageOrigin?: string;
  /**
   * Allow mailto:/tel: schemes on <a> hrefs. Defaults to false; metadata
   * contexts (author email, phone) opt in.
   */
  allowContactSchemes?: boolean;
}

export interface SanitizeResult {
  fragment: DocumentFragment;
  removed: ReadonlyArray<RemovedKind>;
}

export const DEFAULT_ALLOWED_TAGS: ReadonlyArray<string> = [
  'a',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'em',
  'strong',
  'b',
  'i',
  'u',
  'code',
  'pre',
  'blockquote',
  'br',
  'hr',
  'span',
  'div',
  'section',
  'article',
  'aside',
  'figure',
  'figcaption',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'caption',
  'dl',
  'dt',
  'dd',
  'small',
  'sub',
  'sup',
];

/** Tags that get dropped entirely with their entire subtree. */
const DANGEROUS_TAGS = new Set<string>([
  'script',
  'iframe',
  'frame',
  'frameset',
  'noframes',
  'svg',
  'math',
  'object',
  'embed',
  'style',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'option',
  'noscript',
  'template',
]);

const SAFE_GLOBAL_ATTRS = new Set<string>(['lang', 'dir', 'title']);

export function sanitizeHtml(
  input: string,
  options: SanitizeOptions = {}
): SanitizeResult {
  const allowedTags = new Set(
    (options.allowedTags ?? DEFAULT_ALLOWED_TAGS).map((t) => t.toLowerCase())
  );
  const removed: RemovedKind[] = [];

  // Parse in a fresh document. DOMParser is non-executing, so even
  // <script>alert(1)</script> is just inert DOM at this point.
  const doc = new DOMParser().parseFromString(
    `<!doctype html><html><body>${input}</body></html>`,
    'text/html'
  );

  const fragment = document.createDocumentFragment();
  for (const child of Array.from(doc.body.childNodes)) {
    const sanitized = sanitizeNode(child, {
      allowedTags,
      removed,
      pageOrigin: options.pageOrigin,
      allowContactSchemes: options.allowContactSchemes === true,
    });
    if (sanitized !== null) fragment.appendChild(sanitized);
  }

  return { fragment, removed };
}

/**
 * Strip everything but the text. Useful when the caller never wants
 * formatting — e.g., rendering an accessible name or a key fact label.
 *
 * Routes through {@link sanitizeHtml} so script/style bodies (which are
 * text nodes during HTML parsing) are dropped before textContent is read.
 */
export function sanitizeText(input: string): string {
  const { fragment } = sanitizeHtml(input);
  const tmp = document.createElement('div');
  tmp.appendChild(fragment);
  return (tmp.textContent ?? '').replace(/\s+/g, ' ').trim();
}

interface WalkContext {
  allowedTags: ReadonlySet<string>;
  removed: RemovedKind[];
  pageOrigin: string | undefined;
  allowContactSchemes: boolean;
}

function sanitizeNode(node: Node, ctx: WalkContext): Node | null {
  if (node.nodeType === 3 /* TEXT_NODE */) {
    return document.createTextNode(node.nodeValue ?? '');
  }
  if (node.nodeType === 8 /* COMMENT_NODE */) {
    ctx.removed.push('comment');
    return null;
  }
  if (node.nodeType !== 1 /* ELEMENT_NODE */) {
    return null;
  }
  return sanitizeElement(node as Element, ctx);
}

function sanitizeElement(element: Element, ctx: WalkContext): Element | null {
  const tag = element.tagName.toLowerCase();

  if (DANGEROUS_TAGS.has(tag)) {
    ctx.removed.push(tag as RemovedKind);
    return null;
  }
  if (!ctx.allowedTags.has(tag)) {
    ctx.removed.push('unknown_tag');
    return null;
  }

  const out = document.createElement(tag);

  for (const attr of Array.from(element.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value;

    if (name.startsWith('on')) {
      ctx.removed.push('event_handler');
      continue;
    }
    if (name === 'style') {
      ctx.removed.push('inline_style');
      continue;
    }
    if (name.startsWith('data-')) {
      ctx.removed.push('data_attr');
      continue;
    }
    if (name === 'href' && tag === 'a') {
      const allowSchemes = ctx.allowContactSchemes
        ? (['http', 'https', 'mailto', 'tel'] as const)
        : (['http', 'https'] as const);
      const sanitized = sanitizeUrl(value, {
        allowSchemes,
        ...(ctx.pageOrigin !== undefined ? { pageOrigin: ctx.pageOrigin } : {}),
      });
      if (sanitized.kind === 'allowed') {
        out.setAttribute('href', sanitized.href);
        if (sanitized.isExternal) {
          out.setAttribute('rel', 'noopener noreferrer');
          out.setAttribute('target', '_blank');
        }
      } else {
        ctx.removed.push('dangerous_url');
      }
      continue;
    }
    if (SAFE_GLOBAL_ATTRS.has(name)) {
      out.setAttribute(name, value);
      continue;
    }
    // Unknown attribute on a kept tag — drop silently and record.
    ctx.removed.push('unknown_attr');
  }

  for (const child of Array.from(element.childNodes)) {
    const sanitized = sanitizeNode(child, ctx);
    if (sanitized !== null) out.appendChild(sanitized);
  }

  return out;
}
