/**
 * Números para mostrar en textos armados en TypeScript, con coma decimal (es-AR): «29,9».
 * En las plantillas se usa el pipe `number`, que toma el LOCALE_ID es-AR de AppModule.
 */
export function decimal(n: number, digitos: number): string {
  return n.toFixed(digitos).replace('.', ',');
}

/** «2026-11-16» → «16/11/2026» */
export function fechaDDMMAAAA(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
