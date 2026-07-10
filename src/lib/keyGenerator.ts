// src/lib/keyGenerator.ts

function sanitizeUserId(userId: string): string {
  return userId
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 6)
    .toLowerCase();
}

function formatConsecutivo(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Genera llave con formato: rmpx{userId6chars}{consecutivo}
 * Ejemplo: rmpxa1b2c301 (primera llave)
 *          rmpxa1b2c302 (segunda llave)
 */
export function generateBrebKey(userId: string, consecutivo: number): string {
  const userPart = sanitizeUserId(userId);
  const seqPart  = formatConsecutivo(consecutivo);
  const key      = `rmpx${userPart}${seqPart}`;

  if (key.length > 30) throw new Error(`Llave muy larga: ${key}`);
  return key;
}

export function getNextConsecutivo(existingKeys: unknown[]): number {
  return (existingKeys?.length ?? 0) + 1;
}