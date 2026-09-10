/**
 * A whitelist sanitiser for the HTML `marked` produces. Markdown allows raw
 * HTML, so the rendered output can contain anything the author pasted —
 * including a `<script>` tag or an `onerror` handler that would run inside the
 * app. Nothing reaches `dangerouslySetInnerHTML` without passing through here.
 */

/** Elements that are dropped along with everything inside them. */
const DROP_SUBTREE = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'applet', 'link', 'meta', 'base',
  'form', 'input', 'button', 'textarea', 'select', 'option', 'noscript', 'template',
  'svg', 'math', 'frame', 'frameset', 'audio', 'video', 'source', 'track', 'canvas',
  'portal', 'dialog',
]);

/** Elements kept as-is. Anything else is unwrapped, keeping its text. */
const ALLOWED = new Set([
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'blockquote', 'pre', 'code', 'kbd', 'samp', 'var',
  'em', 'strong', 'i', 'b', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup',
  'a', 'img', 'span', 'div', 'section', 'article', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'col', 'colgroup',
  'abbr', 'cite', 'q', 'time',
]);

const GLOBAL_ATTRIBUTES = new Set(['class', 'title', 'id', 'dir', 'lang']);

const TAG_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'name', 'rel'],
  img: ['src', 'alt', 'width', 'height', 'loading'],
  td: ['colspan', 'rowspan', 'align', 'valign'],
  th: ['colspan', 'rowspan', 'align', 'valign', 'scope'],
  col: ['span', 'width'],
  colgroup: ['span'],
  ol: ['start', 'reversed', 'type'],
  li: ['value'],
  time: ['datetime'],
  abbr: ['title'],
  q: ['cite'],
  blockquote: ['cite'],
};

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel', 'ftp', 'ftps']);
const SAFE_IMAGE_DATA = /^data:image\/(png|jpe?g|gif|webp|avif|bmp);base64,/i;

/**
 * Reject anything whose scheme is not on the list. Whitespace and control
 * characters are stripped first, because browsers happily follow
 * `java\nscript:alert(1)` and `  javascript:alert(1)`.
 */
export function isSafeUrl(value: string, isImageSource = false): boolean {
  const cleaned = Array.from(value)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code > 0x20 && code !== 0x7f;
    })
    .join('');
  if (!cleaned) return false;
  if (isImageSource && SAFE_IMAGE_DATA.test(cleaned)) return true;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned);
  if (!scheme) return true; // relative, anchor or protocol-relative URL
  return SAFE_SCHEMES.has(scheme[1].toLowerCase());
}

function unwrap(element: Element): void {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
}

/** Strip everything that could execute, then return the surviving markup. */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const body = doc.body;

  for (const element of Array.from(body.querySelectorAll('*'))) {
    // A parent may already have taken this node with it.
    if (!body.contains(element)) continue;
    const tag = element.tagName.toLowerCase();

    if (DROP_SUBTREE.has(tag)) {
      element.remove();
      continue;
    }
    if (!ALLOWED.has(tag)) {
      unwrap(element);
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        continue;
      }
      const permitted = GLOBAL_ATTRIBUTES.has(name) || (TAG_ATTRIBUTES[tag]?.includes(name) ?? false);
      if (!permitted) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if ((name === 'href' || name === 'src' || name === 'cite') && !isSafeUrl(attribute.value, name === 'src')) {
        element.removeAttribute(attribute.name);
      }
    }

    if (tag === 'a' && element.getAttribute('href')) {
      element.setAttribute('rel', 'noopener noreferrer');
    }
  }

  return body.innerHTML;
}
