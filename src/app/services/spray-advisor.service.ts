import { Injectable } from '@angular/core';

export type MetodoAplicacion = 'MANUAL' | 'MOSQUITO' | 'DRON' | 'AVION' | 'AIRBLAST';
export type Prioridad = 'SEGURIDAD' | 'EQUILIBRADO' | 'EFICACIA';
export type Cultivo = 'CANA' | 'CITRUS' | 'GRANOS';
export type Semaforo = 'VERDE' | 'AMARILLO' | 'ROJO';

export interface MeteoActualOWM {
  main: { temp: number; humidity: number };
  wind: { speed: number; deg?: number; gust?: number };
  clouds?: { all?: number };
  visibility?: number;
  dt?: number;
  sys?: { sunrise?: number; sunset?: number };
  timezone?: number;
}

export interface MeteoPronOWMItem {
  dt: number;
  main: { temp: number; humidity: number };
  wind: { speed: number; deg?: number; gust?: number };
  pop?: number;
  rain?: { '3h'?: number };
  sys?: { pod?: 'd' | 'n' };
  dt_txt?: string;
}

export interface EvaluacionAplicacion {
  semaforo: Semaforo;
  scoreDeriva: number;   // 0..100
  scoreEficacia: number; // 0..100
  deltaT: number;
  inversionProbable: boolean;
  razones: string[];
  recomendaciones: string[];
}

// Reglas por método. Los rangos se pueden ajustar más adelante.
const RULES: Record<MetodoAplicacion, any> = {
  MOSQUITO: {
    windKmh: { green: [5, 15], yellow: [[3, 5], [15, 18]], red: [[0, 3], [18, 999]] },
    deltaT: { green: [2, 8], yellow: [[1, 2], [8, 10], [10, 12]], red: [[0, 1], [12, 999]] },
    gustDeltaYellow: 8,
    gustDeltaRed: 15,
    inversion: { min: 'AMARILLO', forceRed: false },
    popRed: 0.6,
    popYellow: 0.3,
  },
  MANUAL: {
    windKmh: { green: [3, 10], yellow: [[10, 15]], red: [[0, 3], [15, 999]] },
    deltaT: { green: [2, 8], yellow: [[1, 2], [8, 10], [10, 12]], red: [[0, 1], [12, 999]] },
    gustDeltaYellow: 6,
    gustDeltaRed: 12,
    inversion: { min: 'AMARILLO', forceRed: false },
    popRed: 0.6,
    popYellow: 0.3,
  },
  DRON: {
    // BMP UAS (5–16 km/h) + inversión = evitar
    windKmh: { green: [5, 12], yellow: [[12, 16]], red: [[0, 5], [16, 999]] },
    deltaT: { green: [2, 8], yellow: [[1, 2], [8, 10], [10, 12]], red: [[0, 1], [12, 999]] },
    gustDeltaYellow: 6,
    gustDeltaRed: 10,
    inversion: { min: 'ROJO', forceRed: true },
    popRed: 0.5,
    popYellow: 0.25,
  },
  AVION: {
    windKmh: { green: [4, 15], yellow: [[3, 4], [15, 18]], red: [[0, 3], [18, 999]] },
    deltaT: { green: [2, 8], yellow: [[1, 2], [8, 10], [10, 12]], red: [[0, 1], [12, 999]] },
    gustDeltaYellow: 8,
    gustDeltaRed: 14,
    inversion: { min: 'ROJO', forceRed: true },
    popRed: 0.5,
    popYellow: 0.25,
  },
  AIRBLAST: {
    windKmh: { green: [3, 10], yellow: [[10, 15]], red: [[0, 3], [15, 999]] },
    deltaT: { green: [2, 8], yellow: [[1, 2], [8, 10], [10, 12]], red: [[0, 1], [12, 999]] },
    gustDeltaYellow: 6,
    gustDeltaRed: 12,
    inversion: { min: 'ROJO', forceRed: true },
    popRed: 0.6,
    popYellow: 0.3,
  },
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function worst(a: Semaforo, b: Semaforo): Semaforo {
  const r: Record<Semaforo, number> = { VERDE: 0, AMARILLO: 1, ROJO: 2 };
  return r[b] > r[a] ? b : a;
}

function lightScore(l: Semaforo): number {
  return l === 'VERDE' ? 20 : l === 'AMARILLO' ? 55 : 85;
}

function evalThreshold(x: number, rule: any): Semaforo {
  const [g1, g2] = rule.green;
  if (x >= g1 && x <= g2) return 'VERDE';
  for (const [y1, y2] of (rule.yellow ?? [])) if (x >= y1 && x <= y2) return 'AMARILLO';
  for (const [r1, r2] of (rule.red ?? [])) if (x >= r1 && x <= r2) return 'ROJO';
  return 'AMARILLO';
}

@Injectable({ providedIn: 'root' })
export class SprayAdvisorService {

  // Aproximación de Stull (2011). Suficiente para decisión operativa.
  wetBulbTempC(tC: number, rh: number): number {
    const T = tC;
    const RH = clamp(rh, 1, 100);
    return (
      T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) +
      Math.atan(T + RH) -
      Math.atan(RH - 1.676331) +
      0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) -
      4.686035
    );
  }

  deltaT(tC: number, rh: number): number {
    return tC - this.wetBulbTempC(tC, rh);
  }

  // Proxy simple de inversión. Si más adelante agregás T a 2 alturas, se reemplaza.
  inversionProbable(params: { windKmh: number; rh: number; isNight: boolean }): boolean {
    return params.isNight && params.windKmh < 5 && params.rh >= 85;
  }

  isNightFromUnix(dtUtc: number, tzSeconds: number | undefined, sunriseUtc?: number, sunsetUtc?: number): boolean {
    if (!sunriseUtc || !sunsetUtc) {
      // fallback por hora local
      const local = (dtUtc + (tzSeconds ?? 0)) * 1000;
      const h = new Date(local).getUTCHours();
      return h < 7 || h > 19;
    }
    return dtUtc < sunriseUtc || dtUtc > sunsetUtc;
  }

  // Ponderaciones por prioridad/cultivo
  private weights(prioridad: Prioridad, cultivo: Cultivo) {
    let wDeriva = 0.6;
    let wEfic = 0.4;
    if (prioridad === 'SEGURIDAD') { wDeriva = 0.8; wEfic = 0.2; }
    if (prioridad === 'EFICACIA') { wDeriva = 0.4; wEfic = 0.6; }
    if (cultivo === 'CITRUS') wDeriva += 0.05;
    if (cultivo === 'GRANOS') wEfic += 0.05;
    const s = wDeriva + wEfic;
    return { wDeriva: wDeriva / s, wEfic: wEfic / s };
  }

  evaluar(
    meteo: {
      tC: number;
      rh: number;
      windMs: number;
      gustMs?: number;
      pop?: number;
      dtUtc?: number;
      tzSeconds?: number;
      sunriseUtc?: number;
      sunsetUtc?: number;
    },
    metodo: MetodoAplicacion,
    cultivo: Cultivo,
    prioridad: Prioridad,
    extras?: { kpIndex?: number; sats?: number }
  ): EvaluacionAplicacion {
    const rules = RULES[metodo];
    const windKmh = meteo.windMs * 3.6;
    const gustKmh = meteo.gustMs != null ? meteo.gustMs * 3.6 : undefined;
    const dT = this.deltaT(meteo.tC, meteo.rh);

    const isNight = meteo.dtUtc != null
      ? this.isNightFromUnix(meteo.dtUtc, meteo.tzSeconds, meteo.sunriseUtc, meteo.sunsetUtc)
      : false;
    const inv = this.inversionProbable({ windKmh, rh: meteo.rh, isNight });

    const lWind = evalThreshold(windKmh, rules.windKmh);
    const lDT = evalThreshold(dT, rules.deltaT);

    let lGust: Semaforo = 'VERDE';
    if (gustKmh != null) {
      const delta = gustKmh - windKmh;
      if (delta >= rules.gustDeltaRed) lGust = 'ROJO';
      else if (delta >= rules.gustDeltaYellow) lGust = 'AMARILLO';
    }

    let lRain: Semaforo = 'VERDE';
    const pop = meteo.pop ?? 0;
    if (pop >= rules.popRed) lRain = 'ROJO';
    else if (pop >= rules.popYellow) lRain = 'AMARILLO';

    let lInv: Semaforo = 'VERDE';
    if (inv) lInv = rules.inversion.forceRed ? 'ROJO' : rules.inversion.min;

    // Factores extra (no meteorológicos): KP y satélites.
    // No deben dominar el semáforo salvo valores claramente riesgosos.
    let lKp: Semaforo = 'VERDE';
    const kp = extras?.kpIndex;
    if (kp != null) {
      if (kp >= 5) lKp = 'ROJO';
      else if (kp >= 4) lKp = 'AMARILLO';
    }
    let lSats: Semaforo = 'VERDE';
    const sats = extras?.sats;
    if (sats != null) {
      if (sats < 8) lSats = 'ROJO';
      else if (sats < 12) lSats = 'AMARILLO';
    }

    const scoreDeriva = Math.round(
      0.35 * lightScore(lWind) +
      0.20 * lightScore(lGust) +
      0.30 * lightScore(lInv) +
      0.15 * lightScore(lDT)
    );

    const scoreEficacia = Math.round(
      0.45 * lightScore(lRain) +
      0.30 * lightScore(lDT) +
      0.25 * lightScore(lWind)
    );

    const { wDeriva, wEfic } = this.weights(prioridad, cultivo);
    const finalScore = Math.round(wDeriva * scoreDeriva + wEfic * scoreEficacia);
    let sem: Semaforo = finalScore > 65 ? 'ROJO' : finalScore >= 35 ? 'AMARILLO' : 'VERDE';

    // Reglas duras
    sem = worst(sem, worst(lWind, worst(lGust, worst(lDT, lRain))));
    sem = worst(sem, lInv);
    // Extras: solo afectan si son malos
    sem = worst(sem, lKp);
    sem = worst(sem, lSats);

    const razones: string[] = [];
    const recs: string[] = [];
    const push = (arr: string[], s: string) => { if (arr.length < 3) arr.push(s); };

    if (lInv !== 'VERDE') push(razones, 'Riesgo de inversión/atmósfera estable.');
    if (lWind !== 'VERDE') push(razones, `Viento ${windKmh.toFixed(0)} km/h (${lWind}).`);
    if (lGust !== 'VERDE' && gustKmh != null) push(razones, `Ráfagas ${gustKmh.toFixed(0)} km/h (${lGust}).`);
    if (lDT !== 'VERDE') push(razones, `ΔT ${dT.toFixed(1)} °C (${lDT}) → evaporación/deriva.`);
    if (lRain !== 'VERDE') push(razones, `Prob. precipitación ${(pop * 100).toFixed(0)}% (${lRain}).`);
    if (lKp !== 'VERDE') push(razones, `Kp ${kp} (${lKp}) → posible degradación GNSS/compás.`);
    if (lSats !== 'VERDE') push(razones, `Satélites ${sats} (${lSats}) → precisión GNSS baja.`);

    // Recomendaciones por método (conservadoras)
    if (sem === 'ROJO') push(recs, 'Evitar la aplicación en estas condiciones.');
    if (lInv !== 'VERDE') push(recs, 'Esperar ruptura de inversión: más mezcla (viento >5 km/h) y/o mayor radiación.');
    if (lDT === 'ROJO') push(recs, 'Reprogramar a ΔT 2–8 °C o usar gota muy gruesa + antievaporante.');
    if (lWind === 'ROJO' || lGust === 'ROJO') push(recs, 'Si es imprescindible: bajar altura, aumentar tamaño de gota y alejarse de bordes sensibles.');

    // Consejos de operación (genéricos; se pueden ajustar)
    if (metodo === 'DRON') {
      push(recs, 'Dron: usar altura baja/estable (p.ej. 2–4 m sobre canopia) y velocidad moderada para evitar deriva.');
    } else if (metodo === 'AVION') {
      push(recs, 'Avión: respetar altura/velocidad del operador; evitar inversión y vientos hacia zonas sensibles.');
    } else if (metodo === 'MOSQUITO') {
      push(recs, 'Terrestre: mantener botalón lo más bajo y estable posible, y preferir gotas más gruesas con riesgo de deriva.');
    } else if (metodo === 'AIRBLAST') {
      push(recs, 'Airblast: reducir aire en bordes, controlar deriva y evitar viento hacia áreas sensibles.');
    }

    return {
      semaforo: sem,
      scoreDeriva,
      scoreEficacia,
      deltaT: dT,
      inversionProbable: inv,
      razones,
      recomendaciones: recs,
    };
  }
}
