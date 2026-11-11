import catalog from './zh-CN.json' with { type: 'json' };

export const hasKorean = (text) => /[\uac00-\ud7a3]/u.test(text);

// Preserve HTML, interpolation boundaries, escape sequences and surrounding whitespace.
export function textUnits(text) {
  return [...text.matchAll(/[^<>"'`{}\\\r\n]+/gu)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    text: match[0],
  }));
}

export function translateText(text) {
  return text.replace(/[^<>"'`{}\\\r\n]+/gu, (part) => {
    const key = part.trim();
    return Object.hasOwn(catalog, key) ? part.replace(key, () => catalog[key]) : part;
  });
}

export function untranslatedUnits(text) {
  return textUnits(text)
    .map(({ text }) => text.trim())
    .filter(hasKorean);
}
