import sanitizeHtml from 'sanitize-html';

const MARKDOWN_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /^\s*#{1,6}\s+\S/m, label: 'header (#)' },
  { re: /\*\*[^*\n]+\*\*/, label: 'bold (**)' },
  { re: /(^|[^\\])\*[^*\n]+\*/, label: 'italic (*)' },
  { re: /\[[^\]]+\]\([^)]+\)/, label: 'link [..](..)' },
  { re: /^\s*[-*+]\s+\S/m, label: 'bullet list (- )' },
  { re: /^\s*\d+\.\s+\S/m, label: 'numbered list (1. )' },
  { re: /^```/m, label: 'code fence (```)' },
];

/**
 * Convertit du markdown détecté en HTML basique. Best-effort, pas un converteur complet.
 * Couvre les cas où l'IA dérape vers du markdown malgré l'interdiction.
 */
function markdownToHtml(s: string): string {
  return s
    // Headers ## (avant #)
    .replace(/^\s*###\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^\s*##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^\s*#\s+(.+)$/gm, '<h2>$1</h2>')
    // Listes
    .replace(/(^|\n)([-*+]\s+.+(?:\n[-*+]\s+.+)*)/g, (_m, prefix, block) => {
      const items = block
        .split(/\n/)
        .map((line: string) => line.replace(/^[-*+]\s+/, '').trim())
        .filter(Boolean)
        .map((item: string) => `<li>${item}</li>`)
        .join('');
      return `${prefix}<ul>${items}</ul>`;
    })
    // Bold + italic (ordre important : ** avant *)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\\*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    // Liens
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Suppression des fences de code (transforme en <pre><code>)
    .replace(/```([a-z]*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Lignes orphelines = paragraphes (si pas déjà dans un tag bloc)
    .split(/\n{2,}/)
    .map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (/^<(h[1-6]|p|ul|ol|li|pre|blockquote|table)/i.test(trimmed)) return trimmed;
      return `<p>${trimmed}</p>`;
    })
    .join('\n');
}

/**
 * Sanitize l'HTML produit par l'IA avant envoi à WordPress.
 * - Détecte le markdown résiduel (l'IA dérape parfois) et le convertit en HTML.
 * - Bloque scripts, iframes, on*, javascript:, data:, et toute balise hors whitelist.
 * - Le plugin WP applique ensuite wp_kses_post en ceinture-bretelles.
 */
export function sanitizeArticleHtml(raw: string): string {
  let input = raw;

  const detected = MARKDOWN_PATTERNS.filter(p => p.re.test(input)).map(p => p.label);
  if (detected.length > 0) {
    console.warn(`[sanitizeArticleHtml] markdown résiduel détecté (${detected.join(', ')}) — conversion best-effort`);
    input = markdownToHtml(input);
  }

  return sanitizeHtml(input, {
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
