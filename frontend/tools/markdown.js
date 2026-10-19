// Conversor mínimo de Markdown a HTML para PRIVACY.md (títulos, listas, párrafos, negrita y
// enlaces). Suficiente para ese documento y sin dependencias. Escapa el HTML antes de dar
// formato: el contenido nunca se interpreta como HTML.

const escapeHtml = (text) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function inline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>');
}

export function markdownToHtml(markdown) {
  const html = [];
  let list = false;
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) html.push('</ul>');
    list = false;
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (line.startsWith('- ')) {
      flushParagraph();
      if (!list) html.push('<ul>');
      list = true;
      html.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line === '') {
      flushParagraph();
      closeList();
    } else {
      closeList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  closeList();
  return html.join('\n');
}
