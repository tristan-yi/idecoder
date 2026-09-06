export const NOTES_KEY = "notes";
export const META_KEY = "meta";

export function codeKey(language: string) {
  return `code:${language}`;
}

export function isPadId(id: string) {
  return /^[a-zA-Z0-9_-]{8,80}$/.test(id);
}
