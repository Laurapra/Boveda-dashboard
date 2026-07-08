function sanitizeUserId(userId: string): string {
  return userId
    .replace(/[^a-zA-Z0-9]/g, "")   // quita guiones y letras especiales del UUID
    .slice(0, 6)                      // toma los primeros 6 caracteres
    .toLowerCase();
}

// Formatea el consecutivo con ceros a la izquierda: 1 → "01", 12 → "12"
function formatConsecutivo(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * @param userId      - ID del usuario (UUID de Supabase)
 * @param consecutivo - Número de llaves que ya tiene + 1 (se calcula desde getBrebKeys)
 */
export function generateBrebKey(userId: string, consecutivo: number): string {
  const userPart   = sanitizeUserId(userId);
  const seqPart    = formatConsecutivo(consecutivo);
  const key        = `rmpx${userPart}${seqPart}`;

  // Validación de seguridad: no debe superar 30 caracteres
  if (key.length > 30) {
    throw new Error(`Llave generada muy larga: ${key} (${key.length} chars)`);
  }

  return key;
}

/**
 * Calcula el próximo consecutivo basado en las llaves existentes.
 * Si el usuario tiene 0 llaves → consecutivo 1
 * Si tiene 2 llaves → consecutivo 3
 */
export function getNextConsecutivo(existingKeys: unknown[]): number {
  return (existingKeys?.length ?? 0) + 1;
}