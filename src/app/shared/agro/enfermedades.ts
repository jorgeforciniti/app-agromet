/*
 * ADAPTADO de agromet-web: src/app/disease-conditions-dialog/disease-conditions-dialog.component.ts
 * (commit 2f7292a). Las reglas son las mismas (buildSoyRustRow … scalePolisora), pasadas a funciones;
 * si cambian allá, hay que cambiarlas acá.
 *
 * Datos: datos-enfermedades.php (registros cada 15 minutos con temp_af, hum_af, hum_hoja, lluvia,
 * viento_max). La hoja se toma como mojada con hum_hoja ≥ 10 (sensor Davis de 0 a 15, criterio de
 * Mercobras) y cada registro que cumple suma 0,25 h, como en la web.
 */

export type Tono = 'none' | 'low' | 'mild' | 'moderate' | 'high' | 'very-high';

export interface Enfermedad {
  codigo: number;
  nombre: string;
  cultivo: string;
  /** Necesita el sensor de hoja mojada (estaciones.isSoil = 1) */
  requiereMojado: boolean;
  /** Qué mira la regla, en una línea */
  ayuda: string;
}

export interface DiaEnfermedad {
  fecha: string;
  clasificacion: string;
  tono: Tono;
  /** Menos del 90 % de los registros esperados: las horas pueden quedar cortas */
  incompleto: boolean;
}

export const ENFERMEDADES: Enfermedad[] = [
  { codigo: 2, nombre: 'Roya de la caña', cultivo: 'Caña de azúcar', requiereMojado: true, ayuda: '8 h o más con 17–23 °C, humedad ≥ 90 % y hoja mojada.' },
  { codigo: 1, nombre: 'Roya de la soja', cultivo: 'Soja', requiereMojado: true, ayuda: 'Horas de mojado y temperatura media durante el mojado.' },
  { codigo: 3, nombre: 'Mancha marrón', cultivo: 'Soja', requiereMojado: true, ayuda: 'Progreso con 6 h de mojado a 15–30 °C; dispersión con lluvia ≥ 5 mm o viento ≥ 15 km/h.' },
  { codigo: 4, nombre: 'Tizón de la hoja y mancha púrpura', cultivo: 'Soja', requiereMojado: true, ayuda: 'Infección (6 h a 24–32 °C y HR ≥ 70 %), germinación (6 h de mojado) y dispersión.' },
  { codigo: 5, nombre: 'Mancha anillada', cultivo: 'Soja', requiereMojado: true, ayuda: '24 h con 18–21 °C, humedad ≥ 80 % y hoja mojada.' },
  { codigo: 6, nombre: 'Tizón bacteriano', cultivo: 'Soja', requiereMojado: false, ayuda: '6 h a 20–26 °C con viento ≥ 15 km/h y lluvia ≥ 0,5 mm.' },
  { codigo: 10, nombre: 'Tizón foliar', cultivo: 'Maíz', requiereMojado: true, ayuda: 'Horas de mojado a 20–32 °C y a 24–28 °C.' },
  { codigo: 11, nombre: 'Roya polisora', cultivo: 'Maíz', requiereMojado: true, ayuda: 'Horas de mojado a 16–33 °C, 21–27 °C y 22–24 °C.' },
  { codigo: 15, nombre: 'Mancha gris', cultivo: 'Maíz', requiereMojado: true, ayuda: '12 h o más de mojado a 22–30 °C.' },
  { codigo: 16, nombre: 'Fusarium', cultivo: 'Maíz', requiereMojado: true, ayuda: '20 h o más de mojado a 25–28 °C.' },
  { codigo: 14, nombre: 'Roya estriada', cultivo: 'Trigo', requiereMojado: true, ayuda: '3 h o más de mojado a 10–20 °C.' },
  { codigo: 9, nombre: 'Melanosis', cultivo: 'Limón', requiereMojado: true, ayuda: 'Horas de mojado a 10–35 °C y a 20–28 °C.' },
];

const UMBRAL_HOJA_MOJADA = 10;
const COBERTURA_MINIMA = 0.9;
const INTERVALO_POR_DEFECTO = 15;

type Registro = Record<string, any>;

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};
const entre = (v: number, min: number, max: number) => v >= min && v <= max;
const mojada = (r: Registro) => num(r.hum_hoja) >= UMBRAL_HOJA_MOJADA;
const horas = (rs: Registro[], p: (r: Registro) => boolean) => rs.reduce((a, r) => a + (p(r) ? 0.25 : 0), 0);
const suma = (rs: Registro[], f: (r: Registro) => number) => rs.reduce((a, r) => a + f(r), 0);
const maximo = (rs: Registro[], f: (r: Registro) => number) => rs.reduce((a, r) => Math.max(a, f(r)), 0);

/** Clasificación de un día para una enfermedad (las mismas reglas que la web) */
export function clasificarDia(codigo: number, rs: Registro[]): { clasificacion: string; tono: Tono } {
  const lluvia = suma(rs, r => num(r.lluvia));
  const viento = maximo(rs, r => num(r.viento_max));

  switch (codigo) {
    case 1: { // Roya de la soja
      const hm = horas(rs, mojada);
      const t = hm > 0 ? suma(rs, r => mojada(r) ? num(r.temp_af) : 0) / (hm * 4) : 0;
      if (hm >= 6 && hm < 12) {
        if (entre(t, 19, 24)) return { clasificacion: 'Alto', tono: 'high' };
        if (entre(t, 11, 19) || entre(t, 24, 28)) return { clasificacion: 'Moderado', tono: 'moderate' };
        return { clasificacion: 'Ligero', tono: 'mild' };
      }
      if (hm >= 12) return entre(t, 11, 28) ? { clasificacion: 'Alto', tono: 'high' } : { clasificacion: 'Ligero', tono: 'mild' };
      return { clasificacion: 'Bajo', tono: 'low' };
    }
    case 2: { // Roya de la caña
      const h = horas(rs, r => entre(num(r.temp_af), 17, 23) && num(r.hum_af) >= 90 && mojada(r));
      return h >= 8 ? { clasificacion: 'Favorable', tono: 'high' } : { clasificacion: 'No', tono: 'low' };
    }
    case 3: { // Mancha marrón
      const hm = horas(rs, mojada);
      const t = hm > 0 ? suma(rs, r => mojada(r) ? num(r.temp_af) : 0) / (hm * 4) : 0;
      const progreso = hm >= 6 && entre(t, 15, 30);
      const dispersion = viento >= 15 || lluvia >= 5;
      if (progreso && dispersion) return { clasificacion: 'Progreso y dispersión', tono: 'high' };
      if (progreso) return { clasificacion: 'Progreso', tono: 'moderate' };
      if (dispersion) return { clasificacion: 'Dispersión', tono: 'mild' };
      return { clasificacion: 'Bajo', tono: 'low' };
    }
    case 4: { // Cercospora
      const partes: string[] = [];
      let tono: Tono = 'low';
      if (horas(rs, r => entre(num(r.temp_af), 24, 32) && num(r.hum_af) >= 70) >= 6) { partes.push('infección'); tono = 'moderate'; }
      if (horas(rs, mojada) >= 6) { partes.push('germinación'); tono = 'high'; }
      if (viento >= 15 || lluvia >= 5) { partes.push('dispersión'); tono = partes.length > 1 ? 'very-high' : 'mild'; }
      if (!partes.length) return { clasificacion: 'No', tono: 'low' };
      const texto = partes.join(', ');
      return { clasificacion: texto.charAt(0).toUpperCase() + texto.slice(1), tono };
    }
    case 5: { // Mancha anillada
      const h = horas(rs, r => entre(num(r.temp_af), 18, 21) && num(r.hum_af) >= 80 && mojada(r));
      return h >= 24 ? { clasificacion: 'Infección', tono: 'high' } : { clasificacion: 'No', tono: 'low' };
    }
    case 6: { // Tizón bacteriano
      const h = horas(rs, r => entre(num(r.temp_af), 20, 26));
      return h >= 6 && viento >= 15 && lluvia >= 0.5 ? { clasificacion: 'Infección', tono: 'high' } : { clasificacion: 'No', tono: 'low' };
    }
    case 9: // Melanosis
      return escala(horas(rs, r => mojada(r) && entre(num(r.temp_af), 10, 35)), horas(rs, r => mojada(r) && entre(num(r.temp_af), 20, 28)));
    case 10: // Tizón foliar
      return escala(horas(rs, r => mojada(r) && entre(num(r.temp_af), 20, 32)), horas(rs, r => mojada(r) && entre(num(r.temp_af), 24, 28)),
        2, 6, 2, 12, 6, 12);
    case 11: { // Roya polisora
      const amplia = horas(rs, r => mojada(r) && entre(num(r.temp_af), 16, 33));
      const media = horas(rs, r => mojada(r) && entre(num(r.temp_af), 21, 27));
      const estrecha = horas(rs, r => mojada(r) && entre(num(r.temp_af), 22, 24));
      let res: { clasificacion: string; tono: Tono } = { clasificacion: 'Bajo', tono: 'low' };
      if (amplia >= 8) res = { clasificacion: 'Ligero', tono: 'mild' };
      if (amplia >= 12 || media >= 8) res = { clasificacion: 'Moderado', tono: 'moderate' };
      if (media >= 12 || estrecha >= 8) res = { clasificacion: 'Alto', tono: 'high' };
      if (estrecha >= 12) res = { clasificacion: 'Muy alto', tono: 'very-high' };
      return res;
    }
    case 14: { // Roya estriada
      const h = horas(rs, r => mojada(r) && entre(num(r.temp_af), 10, 20));
      return h >= 3 ? { clasificacion: 'Apto', tono: 'high' } : { clasificacion: 'No apto', tono: 'low' };
    }
    case 15: // Mancha gris
      return horas(rs, r => mojada(r) && entre(num(r.temp_af), 22, 30)) >= 12
        ? { clasificacion: 'Favorable', tono: 'high' } : { clasificacion: 'No', tono: 'low' };
    case 16: // Fusarium
      return horas(rs, r => mojada(r) && entre(num(r.temp_af), 25, 28)) >= 20
        ? { clasificacion: 'Favorable', tono: 'very-high' } : { clasificacion: 'No', tono: 'low' };
    default:
      return { clasificacion: 'Sin regla', tono: 'low' };
  }
}

/** scaleRisk de la web */
function escala(amplia: number, estrecha: number, ligeroA = 4, moderadoA = 8, moderadoE = 4, altoA = 12, altoE = 8,
  muyAltoE = 12): { clasificacion: string; tono: Tono } {
  let res: { clasificacion: string; tono: Tono } = { clasificacion: 'Bajo', tono: 'low' };
  if (amplia >= ligeroA) res = { clasificacion: 'Ligero', tono: 'mild' };
  if (amplia >= moderadoA || estrecha >= moderadoE) res = { clasificacion: 'Moderado', tono: 'moderate' };
  if (amplia >= altoA || estrecha >= altoE) res = { clasificacion: 'Alto', tono: 'high' };
  if (estrecha >= muyAltoE) res = { clasificacion: 'Muy alto', tono: 'very-high' };
  return res;
}

/** Un resultado por día del período (los días sin registros quedan «Sin datos») */
export function clasificarPeriodo(codigo: number, registros: Registro[], fechas: string[]): DiaEnfermedad[] {
  const porDia = new Map<string, Registro[]>();
  for (const r of registros) {
    const f = String(r?.fecha ?? '').slice(0, 10);
    if (!f) continue;
    if (!porDia.has(f)) porDia.set(f, []);
    porDia.get(f)!.push(r);
  }
  const intervalo = inferirIntervalo(porDia);

  return fechas.map(fecha => {
    const rs = porDia.get(fecha) ?? [];
    if (!rs.length) return { fecha, clasificacion: 'Sin datos', tono: 'none' as Tono, incompleto: false };
    const { clasificacion, tono } = clasificarDia(codigo, rs);
    return { fecha, clasificacion, tono, incompleto: rs.length < esperados(fecha, intervalo) * COBERTURA_MINIMA };
  });
}

function minutos(hora: any): number | null {
  const [h, m] = String(hora ?? '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

/** La diferencia más frecuente entre registros consecutivos (típicamente 15 min) */
function inferirIntervalo(porDia: Map<string, Registro[]>): number {
  const frecuencia = new Map<number, number>();
  porDia.forEach(rs => {
    const ms = rs.map(r => minutos(r.hora)).filter((m): m is number => m !== null).sort((a, b) => a - b);
    for (let i = 1; i < ms.length; i++) {
      const d = ms[i] - ms[i - 1];
      if (d > 0) frecuencia.set(d, (frecuencia.get(d) ?? 0) + 1);
    }
  });
  let intervalo = INTERVALO_POR_DEFECTO;
  let max = 0;
  frecuencia.forEach((c, d) => { if (c > max) { max = c; intervalo = d; } });
  return intervalo;
}

/** Registros esperados en el día; hoy, sólo hasta la hora actual */
function esperados(fecha: string, intervalo: number): number {
  const ahora = new Date();
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  const mins = fecha === hoy ? ahora.getHours() * 60 + ahora.getMinutes() : 24 * 60;
  return Math.max(1, Math.floor(mins / intervalo));
}
