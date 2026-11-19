import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

/**
 * Pronóstico de helada para la noche, con el pronóstico horario de Open-Meteo (gratuito para uso no
 * comercial, sin clave; pide citar la fuente). Se pasa la altura de la estación para que corrija la
 * temperatura por altitud.
 *
 * Criterio (temperatura del aire a 1,5–2 m, como el abrigo meteorológico):
 * - mínima ≤ 0 °C: helada probable;
 * - mínima ≤ 3 °C: posible helada en superficie (en noches despejadas y calmas el suelo y los cultivos
 *   pueden estar 2–3 °C más fríos que el abrigo);
 * - más de 3 °C: sin riesgo, no se avisa.
 */
export type RiesgoHelada = 'probable' | 'posible' | 'sin-riesgo';

export interface PronosticoHelada {
  riesgo: RiesgoHelada;
  /** Mínima pronosticada en la ventana (°C) */
  minima: number;
  /** Hora local de la mínima, 0–23 */
  horaMinima: number;
  /** «esta noche» o «hasta las 10 h» */
  periodo: string;
  /** Noche despejada y con poco viento (favorece la helada de radiación) */
  despejadoYCalmo: boolean;
}

/** Hasta qué hora de la mañana se mira */
const HORA_FIN = 10;
/** Un mismo pronóstico sirve por una hora */
const VIGENCIA_MS = 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class PronosticoHeladasService {
  private cache = new Map<string, { cuando: number; dato: PronosticoHelada | null }>();

  constructor(private http: HttpClient) {}

  /** null si no se pudo obtener (sin conexión, error del servicio) */
  obtener(lat: number, lon: number, altura?: number | null): Observable<PronosticoHelada | null> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return of(null);

    const clave = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const guardado = this.cache.get(clave);
    if (guardado && Date.now() - guardado.cuando < VIGENCIA_MS) return of(guardado.dato);

    const params: Record<string, string> = {
      latitude: String(lat),
      longitude: String(lon),
      hourly: 'temperature_2m,cloud_cover,wind_speed_10m',
      timezone: 'America/Argentina/Buenos_Aires',
      forecast_days: '2',
    };
    if (altura != null && Number.isFinite(Number(altura))) params.elevation = String(altura);

    return this.http.get<any>(environment.openMeteoUrl, { params }).pipe(
      map(json => this.evaluar(json)),
      catchError(() => of(null)),
      tap(dato => this.cache.set(clave, { cuando: Date.now(), dato }))
    );
  }

  private evaluar(json: any): PronosticoHelada | null {
    const h = json?.hourly;
    const horas: string[] = h?.time ?? [];
    if (!horas.length) return null;

    // Ventana: desde la hora actual hasta las 10 h siguientes (de hoy si es de madrugada, si no de mañana)
    const ahora = new Date();
    const fin = new Date(ahora);
    if (ahora.getHours() >= HORA_FIN - 4) fin.setDate(fin.getDate() + 1);
    fin.setHours(HORA_FIN, 0, 0, 0);

    let minima = Infinity;
    let iMin = -1;
    for (let i = 0; i < horas.length; i++) {
      const t = new Date(horas[i]); // hora local (la API devuelve sin zona, en la zona pedida)
      if (t < new Date(ahora.getTime() - 60 * 60 * 1000) || t > fin) continue;
      const temp = Number(h.temperature_2m?.[i]);
      if (Number.isFinite(temp) && temp < minima) {
        minima = temp;
        iMin = i;
      }
    }
    if (iMin < 0) return null;

    const nubes = Number(h.cloud_cover?.[iMin]);
    const viento = Number(h.wind_speed_10m?.[iMin]);

    return {
      riesgo: minima <= 0 ? 'probable' : minima <= 3 ? 'posible' : 'sin-riesgo',
      minima,
      horaMinima: new Date(horas[iMin]).getHours(),
      periodo: fin.getDate() !== ahora.getDate() ? 'esta noche' : `hasta las ${HORA_FIN} h`,
      despejadoYCalmo: Number.isFinite(nubes) && Number.isFinite(viento) && nubes < 30 && viento < 8,
    };
  }
}
