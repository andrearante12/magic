/** Room codes are 6 chars, A–Z and 2–9 (no ambiguous I/O/0/1 on creation, but
 *  we accept any alphanumerics a user might type). */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
