/**
 * Forced safe search.
 *
 * Search engines publish alternate hostnames that serve the same site with
 * explicit results switched off. Answering a lookup with the safe host's
 * address instead of the real one turns safe search on for every client on the
 * machine, with no browser setting to flip and none to flip back.
 *
 * This is a third kind of answer, alongside "block" and "allow": the site still
 * works and still presents a valid certificate -- it is the same company's
 * servers -- it just refuses to return explicit results.
 */

import { readFile } from "node:fs/promises";

import { normalize } from "./blocklist.js";

export class SafeSearch {
  private map = new Map<string, string>();

  constructor(private readonly path?: string) {}

  async load(): Promise<number> {
    if (this.path === undefined) return 0;
    let text: string;
    try {
      text = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.map = new Map();
        return 0;
      }
      throw error;
    }
    this.map = parseMappings(text);
    return this.map.size;
  }

  /** The safe-search host for this name, or null to treat it normally. */
  target(name: string): string | null {
    return this.map.get(normalize(name)) ?? null;
  }

  get size(): number {
    return this.map.size;
  }

  /** Every host we redirect to, so they are never redirected themselves. */
  get targets(): Set<string> {
    return new Set(this.map.values());
  }
}

export function parseMappings(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    const withoutComment = (line.split("#", 1)[0] ?? "").trim();
    if (withoutComment === "") continue;
    const [from, to] = withoutComment.split(/\s+/);
    if (from === undefined || to === undefined) continue;
    const source = normalize(from);
    const target = normalize(to);
    // A mapping to itself would loop the resolver back through this table.
    if (source !== "" && target !== "" && source !== target) map.set(source, target);
  }
  return map;
}
