// Netlify Blobs on Netlify; an in-memory store with the same calls for local tests.
import { getStore } from "@netlify/blobs";

const memory = new Map();

function memoryStore(name) {
  const k = (key) => `${name}/${key}`;
  return {
    async get(key, opts) {
      const v = memory.get(k(key));
      return v === undefined ? null : opts?.type === "json" ? JSON.parse(v) : v;
    },
    async setJSON(key, value) { memory.set(k(key), JSON.stringify(value)); },
  };
}

export function store(name) {
  try {
    return getStore({ name, consistency: "strong" });
  } catch {
    if (process.env.NETLIFY) throw new Error(`Netlify Blobs unavailable for store "${name}"`);
    return memoryStore(name);
  }
}
