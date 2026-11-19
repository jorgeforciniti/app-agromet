/*
 * COPIA PARCIAL de agromet-web: src/app/charts/dias-faltantes.ts (commit 2f7292a): sólo lo que usa
 * balance-hidrico.ts (el resto depende de Chart.js 3, que la app no tiene).
 */
export type FormatoSerie = 'diario' | 'decadico' | 'mensual';

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function fechaIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** aaaa-mm-dd → dd/mm */
export function etiquetaDia(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}

/**
 * Fechas aaaa-mm-dd de desde a hasta inclusive, sin pasar de hoy (lo futuro no es un
 * faltante). Hoy entra sólo si ya tiene registro: el día en curso puede no estar cargado.
 */
export function fechasDelPeriodo(desde: Date, hasta: Date, conRegistro?: (fecha: string) => boolean): string[] {
  const hoy = new Date();
  const tope = hasta > hoy ? hoy : hasta;
  const fechas: string[] = [];
  for (let d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate()); d <= tope;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    fechas.push(fechaIso(d));
  }
  const fechaHoy = fechaIso(hoy);
  if (fechas[fechas.length - 1] === fechaHoy && conRegistro && !conRegistro(fechaHoy)) fechas.pop();
  return fechas;
}

/** Registros por fecha aaaa-mm-dd */
export function porFecha<T extends { fecha: string }>(registros: T[]): Map<string, T> {
  return new Map(registros.map(r => [String(r.fecha).slice(0, 10), r]));
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/**
 * Valor diario de una variable, o null si el día no tiene registro o la variable no tiene
 * dato. 'HR' es el promedio de la máxima y la mínima. ET 0 con radiación 0 o sin dato es
 * el sensor de radiación sin datos, no un día sin evapotranspiración.
 */
export function valorDiario(r: object | undefined, clave: string): number | null {
  if (!r) return null;
  const reg = r as Record<string, unknown>;
  if (clave === 'HR') {
    const max = numero(reg['HR_max']);
    const min = numero(reg['HR_min']);
    return max === null || min === null ? null : (max + min) / 2;
  }
  const v = numero(reg[clave]);
  if (clave === 'et' || clave === 'rad_solar_media') {
    const et = numero(reg['et']);
    const rad = numero(reg['rad_solar_media']);
    if (et === 0 && (rad === null || rad === 0)) return null;
  }
  return v;
}

/** Un punto del eje: un día, una década o un mes, con los días del período que abarca */
export interface Periodo {
  clave: string;
  etiqueta: string;
  fechas: string[];
}

/** Agrupa el calendario en días, décadas (01-10, 11-20, 21-fin) o meses, en orden. */
export function periodosDe(fechas: string[], formato: FormatoSerie): Periodo[] {
  if (formato !== 'decadico' && formato !== 'mensual') {
    return fechas.map(f => ({ clave: f, etiqueta: etiquetaDia(f), fechas: [f] }));
  }
  const grupos = new Map<string, Periodo>();
  for (const f of fechas) {
    const dia = Number(f.slice(8, 10));
    const dec = dia <= 10 ? 1 : dia <= 20 ? 2 : 3;
    const clave = formato === 'mensual' ? f.slice(0, 7) : `${f.slice(0, 7)}-${dec}`;
    if (!grupos.has(clave)) {
      const mes = `${MESES_CORTOS[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}`;
      const etiqueta = formato === 'mensual' ? mes : `${['01-10', '11-20', '21-fin'][dec - 1]} ${mes}`;
      grupos.set(clave, { clave, etiqueta, fechas: [] });
    }
    grupos.get(clave)!.fechas.push(f);
  }
  return [...grupos.values()];
}

