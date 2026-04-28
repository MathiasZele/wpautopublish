import sanitizeHtml from 'sanitize-html';

/**
 * Sanitize l'HTML produit par l'IA avant envoi à WordPress.
 * Bloque scripts, iframes, on*, javascript:, data:, et toute balise hors whitelist.
 * Le plugin WP applique ensuite wp_kses_post en ceinture-bretelles.
 */
export function sanitizeArticleHtml(raw: string): string {
  return sanitizeHtml(raw, {
    allowedTags: [
      'h2', 'h3', 'h4', 'p', 'br', 'hr',
      'ul', 'ol', 'li',
      'strong', 'b', 'em', 'i', 'u', 'mark',
      'a', 'blockquote', 'q', 'cite',
      'code', 'pre',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      'h2': ['id'],
      'h3': ['id'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: 'noopener noreferrer',
          target: attribs.target === '_blank' ? '_blank' : '_self',
        },
      }),
    },
    disallowedTagsMode: 'discard',
  });
}
