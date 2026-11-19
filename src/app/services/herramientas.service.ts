import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { gradosDia } from '../shared/agro/grados-dia';
import { calcularBalance, CAD_POR_DEFECTO, DecadaBalance, inicioDelCalculo, OPCIONES_POR_DEFECTO } from '../shared/agro/balance-hidrico';
import { fechaIso, fechasDelPeriodo, porFecha } from '../shared/agro/dias-faltantes';
import { clasificarPeriodo, DiaEnfermedad } from '../shared/agro/enfermedades';

/**
 * Herramientas agronómicas de la pestaña Más, con los mismos cálculos que los diálogos de /datos de la
 * web (shared/agro/ es copia de esos archivos). Los PHP de /services/ ya depuran los sensores de baja.
 */

export interface ResultadoFrio {
  horas: number;
  utah: number;
  diasValidos: number;
  diasTotales: number;
}

export interface ResultadoSumaTermica {
  total: number;
  diasValidos: number;
  diasTotales: number;
}

export interface ResultadoBalance {
  /** Última década calculada (almacenaje al final) */
  ultima: DecadaBalance | null;
  cad: number;
  deficit: number;
  exceso: number;
  /** Si el balance se cortó por falta de datos */
  corte: string | null;
}

/** Tope de la máxima para los grados-día (como TOPE_GRADOS_DIA de la web) */
const TOPE_GRADOS_DIA = 30;

@Injectable({ providedIn: 'root' })
export class HerramientasService {
  private readonly base = environment.servicesBase;

  constructor(private http: HttpClient) {}

  /**
   * Horas con temperatura ≤ base y unidades Utah. Las calcula horas-frio.php por día (mismo criterio que
   * la web), para no bajar al celular los registros cada 15 minutos (unos 7 MB por cinco meses).
   */
  horasDeFrio(estacion: string, desde: Date, hasta: Date, base: number): Observable<ResultadoFrio | null> {
    const diasTotales = fechasDelPeriodo(desde, hasta).length;
    if (!diasTotales) return of(null);

    return this.get('horas-frio.php', { estacion, desde: fechaIso(desde), hasta: fechaIso(hasta), base: String(base) }).pipe(
      map(res => {
        const validos = this.filas(res).filter(d => d?.suficiente);
        return {
          horas: validos.reduce((a, d) => a + Number(d.horas || 0), 0),
          utah: validos.reduce((a, d) => a + Number(d.utah || 0), 0),
          diasValidos: validos.length,
          diasTotales,
        };
      }),
      catchError(() => of(null))
    );
  }

  /**
   * Grados-día por el método del promedio (máxima cortada en 30 °C) con datos-diarios.php. A diferencia de
   * la web no se revisa día por día si hubo registros suficientes (serían cientos de consultas desde el
   * celular): se descartan los días sin máxima o mínima y los de más de 50 grados-día.
   */
  sumaTermica(estacion: string, desde: Date, hasta: Date, base: number): Observable<ResultadoSumaTermica | null> {
    return this.get('datos-diarios.php', { estacion, desde: fechaIso(desde), hasta: fechaIso(hasta) }).pipe(
      map(res => {
        const filas = this.filas(res);
        let total = 0;
        let diasValidos = 0;
        for (const f of filas) {
          const tmax = Number(f?.temp_max);
          const tmin = Number(f?.temp_min);
          if (f?.temp_max == null || f?.temp_min == null || !Number.isFinite(tmax) || !Number.isFinite(tmin)) continue;
          const gd = gradosDia(tmin, tmax, base, TOPE_GRADOS_DIA, 'promedio');
          if (gd > 50) continue;
          total += gd;
          diasValidos++;
        }
        return { total, diasValidos, diasTotales: fechasDelPeriodo(desde, hasta).length };
      }),
      catchError(() => of(null))
    );
  }

  /** Balance hídrico seriado decádico con CAD 300 mm y almacenaje inicial estimado (como la web por defecto) */
  balanceHidrico(estacion: string, desde: Date, hasta: Date): Observable<ResultadoBalance | null> {
    const opciones = OPCIONES_POR_DEFECTO;
    const inicio = inicioDelCalculo(desde, opciones);

    return this.get('datos-diarios.php', { estacion, desde: fechaIso(inicio), hasta: fechaIso(hasta) }).pipe(
      map(res => {
        const registros = porFecha(this.filas(res) as Array<{ fecha: string }>);
        const fechas = fechasDelPeriodo(inicio, hasta, f => registros.has(f));
        const r = calcularBalance(registros, fechas, desde, opciones);
        const calculadas = r.decadas.filter(d => d.almacenaje !== null);
        return {
          ultima: calculadas[calculadas.length - 1] ?? null,
          cad: CAD_POR_DEFECTO,
          deficit: calculadas.reduce((a, d) => a + Math.min(d.situacion ?? 0, 0), 0),
          exceso: calculadas.reduce((a, d) => a + Math.max(d.situacion ?? 0, 0), 0),
          corte: r.corte,
        };
      }),
      catchError(() => of(null))
    );
  }

  /** Condiciones para una enfermedad, día por día (datos-enfermedades.php, registros cada 15 min) */
  enfermedad(estacion: string, codigo: number, desde: Date, hasta: Date): Observable<DiaEnfermedad[] | null> {
    return this.get('datos-enfermedades.php', { estacion, desde: fechaIso(desde), hasta: fechaIso(hasta) }).pipe(
      map(res => clasificarPeriodo(codigo, this.filas(res), fechasDelPeriodo(desde, hasta))),
      catchError(() => of(null))
    );
  }

  private get(archivo: string, params: Record<string, string>): Observable<any> {
    return this.http.get(`${this.base}${archivo}`, { params: new HttpParams({ fromObject: params }) });
  }

  /** Los PHP de /services/ responden un arreglo o { data: [...] } */
  private filas(res: any): any[] {
    return Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
  }
}
