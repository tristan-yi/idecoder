export function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `pad_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
