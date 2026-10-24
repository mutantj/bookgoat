export interface Dictionary {
  has(word: string): boolean;
}

export function dictionaryFromText(text: string): Dictionary {
  const words = new Set(
    text
      .split(/\r?\n/)
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean),
  );
  return { has: (w) => words.has(w.toLowerCase()) };
}

export function wordsFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}
