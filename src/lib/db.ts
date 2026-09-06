import { neon } from "@neondatabase/serverless";

let cached: ReturnType<typeof neon> | null | undefined;

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

export function getSql() {
  if (cached !== undefined) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    cached = null;
    return null;
  }
  cached = neon(url);
  return cached;
}
