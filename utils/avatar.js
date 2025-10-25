// utils/avatar.js
// Simple avatar helpers: initials, deterministic color, SVG data-uri generator.

function initialsOf(name = '') {
  if (!name) return 'U';
  return (
    String(name)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0].toUpperCase())
      .join('') || 'U'
  );
}

function colorForName(name = '') {
  const palette = [
    '#6EE7B7',
    '#7DD3FC',
    '#FDBA74',
    '#FBCFE8',
    '#C7B3FF',
    '#FECACA',
    '#D1FAE5',
    '#FEF08A',
    '#BFE3FF',
    '#CDE6C9',
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return palette[h % palette.length];
}

function svgDataUri(initials, bg, size = 128, fg = '#ffffff') {
  const fontSize = Math.round(size * 0.45);
  const rx = Math.round(size * 0.18);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>
    <rect width='100%' height='100%' fill='${bg}' rx='${rx}'/>
    <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
      font-family='Segoe UI, Roboto, Arial, Helvetica, sans-serif'
      font-size='${fontSize}' fill='${fg}'>${escapeXml(initials)}</text>
  </svg>`;
  const b64 = Buffer.from(svg, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}

function escapeXml(s = '') {
  return String(s).replace(/[&<>'"]/g, (c) => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }[c];
  });
}

/**
 * Given a testimonial-like object { name, photo_url, gender }, returns an avatar URL:
 * - photo_url if present
 * - otherwise an SVG data URI generated from initials and deterministic background color
 */
function avatarFor(obj = {}, size = 128) {
  if (obj && obj.photo_url) return obj.photo_url;
  const name = (obj && (obj.name || obj.full_name || obj.first_name)) || '';
  const initials = initialsOf(name);
  const bg = colorForName(name || 'user');
  return svgDataUri(initials, bg, size);
}

module.exports = {
  initialsOf,
  colorForName,
  svgDataUri,
  avatarFor,
};
