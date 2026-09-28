/** `useLocalSearchParams` hands back a string, an array, or nothing. */
export function firstParam(value: string | string[] | undefined, fallback: string): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.length > 0 ? raw : fallback;
}

/** Category ids travel between steps as one comma-joined param. */
export function parseList(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return [];
  return raw.split(',').filter((part) => part.length > 0);
}
