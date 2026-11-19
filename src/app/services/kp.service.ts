import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
export interface KpLatest {
  timeTag: string;      // UTC sin zona ("YYYY-MM-DDTHH:mm:ss" o el viejo "YYYY-MM-DD HH:mm:ss.SSS")
  kp: number;           // 0..9 (puede venir con decimales)
  stationCount?: number;
}

@Injectable({ providedIn: 'root' })
export class KpService {
  /**
   * Feed oficial SWPC (NOAA) en formato "tabla" JSON.
   * Contiene Kp observado en intervalos de 3 horas.
   */
  private readonly url = environment.swpcKpUrl;

  constructor(private http: HttpClient) {}

  /** Obtiene el último Kp disponible (observado). */
  getLatestKp(): Observable<KpLatest> {
    return this.http.get<any>(this.url).pipe(
      map((rows) => {
        if (!Array.isArray(rows) || rows.length === 0) {
          throw new Error('Formato inesperado de SWPC Kp');
        }
        // SWPC pasó de una tabla (primera fila con encabezados) a una lista de objetos
        // {time_tag, Kp, station_count}; se aceptan los dos formatos.
        let last: any;
        if (Array.isArray(rows[0])) {
          const headers: string[] = rows[0];
          if (rows.length < 2 || !headers.includes('time_tag') || !headers.includes('Kp')) {
            throw new Error('Encabezados faltantes en SWPC Kp');
          }
          const fila = rows[rows.length - 1];
          last = {};
          headers.forEach((h, i) => (last[h] = fila[i]));
        } else {
          last = rows[rows.length - 1];
        }
        const timeTag = String(last?.time_tag ?? '');
        const kp = Number(last?.Kp);
        const stationCount = last?.station_count != null ? Number(last.station_count) : undefined;
        if (!Number.isFinite(kp)) throw new Error('Kp inválido');
        return { timeTag, kp, stationCount } as KpLatest;
      })
    );
  }
}
