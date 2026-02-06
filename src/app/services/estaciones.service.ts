import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { tap } from 'rxjs/operators';
import { BehaviorSubject } from 'rxjs';

export interface EstacionDatos {
  lat: number;
  lon: number;
  // agregá lo que uses
}

@Injectable({ providedIn: 'root' })
export class EstacionesService {
  private stationChangedSubject = new BehaviorSubject<string | null>(localStorage.getItem('estacion'));
  stationChanged$ = this.stationChangedSubject.asObservable();

  setSelectedStation(estacion: string | number) {
    const v = String(estacion);
    localStorage.setItem('estacion', v);
    this.stationChangedSubject.next(v);
  }

  getSelectedStation(): string | null {
    return localStorage.getItem('estacion');
  }
  
  dato: any;
  private agrometBase = 'https://agromet.eeaoc.gob.ar/android/';
  private servicesBase = 'https://agromet.eeaoc.gob.ar/services/';
  private apiKey = 'ea2faa440ccc747a20a042317dadac3f';

  constructor(private http: HttpClient) { }

  getVersion(): Observable<any> {
    return this.http.get(`${this.agrometBase}io_version.php`)
      .pipe(catchError(() => of(null)));
  }

  getPosts() {
  console.log('[SERVICE] getPosts() → pidiendo estaciones');
  return this.http.get<any[]>(`${this.agrometBase}io_estaciones.php?habilitada=2`).pipe(
    tap(res => console.log('[SERVICE] getPosts() OK:', res?.length, res?.[0])),
    catchError(err => {
      console.error('[SERVICE] getPosts() ERROR:', err);
      return of([]);
    })
  );
}

  getDatos(estacion: string | number) {
  console.log('[SERVICE] getDatosByEstacion() → estacion =', estacion);
  return this.http.get<any>(`${this.agrometBase}io_datos.php?estacion=${estacion}`).pipe(
    tap(res => console.log('[SERVICE] getDatos() OK:', res)),
    catchError(err => {
      console.error('[SERVICE] getDatos() ERROR:', err);
      return of(null);
    })
  );
}

  getTemperaturas(estacion: number): Observable<any> {
    const params = new HttpParams().set('estacion', String(estacion));
    return this.http.get(`${this.agrometBase}io_temperaturas.php`, { params })
      .pipe(catchError(() => of(null)));
  }

  // Reemplaza getTempMax/getTempMin/getHelDia/getHelMes/getHelAnio con:
  getTempMax() { return this.getTemperaturas(0); }
  getTempMin() { return this.getTemperaturas(-1); }
  getHelDia() { return this.getTemperaturas(-1); } // ojo: hoy está igual que TempMin (¿es intencional?)
  getHelMes() { return this.getTemperaturas(-2); }
  getHelAnio() { return this.getTemperaturas(-3); }

  getRR(estacion: number): Observable<any> {
    const params = new HttpParams().set('estacion', String(estacion));
    return this.http.get(`${this.agrometBase}io_rr.php`, { params })
      .pipe(catchError(() => of(null)));
  }
  getRRMes(estacion: number) { return this.getRR(estacion); }
  getRR24() { return this.getRR(0); }

  getNoticias(): Observable<any> {
    return this.http.get(`${this.agrometBase}io_noticias.php`)
      .pipe(catchError(() => of([])));
  }

  getSmnAlertByArea(area: number, tipo = 1): Observable<any> {
    const params = new HttpParams().set('area', String(area)).set('tipo', String(tipo));
    return this.http.get(`${this.servicesBase}pronosticos/smn-alerta-area.php`, { params })
      .pipe(catchError(() => of(null)));
  }

  getClimaActual(lat: number, lon: number): Observable<any> {
    const params = new HttpParams()
      .set('lat', String(lat))
      .set('lon', String(lon));
    // Si seguís pegándole directo a OWM:
    return this.http.get(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&lang=es&units=metric&appid=${this.apiKey}`);
  }

  getPronostico(lat: number, lon: number): Observable<any> {
    return this.http.get(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&lang=es&units=metric&appid=${this.apiKey}`);
  }
  getTemperatura24(estacion: string | number): Observable<any> {
    return this.getTemperaturas(Number(estacion));
  }
  
}
