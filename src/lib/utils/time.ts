export function nowIso() {
  return new Date().toISOString();
}

export function createId() {
  return crypto.randomUUID();
}
