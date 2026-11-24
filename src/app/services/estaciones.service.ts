import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { tap } from 'rxjs/operators';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from 'src/environments/environment';
import { salidaPuestaSol } from './spray-advisor.service';
import { actualizarWidget } from './widget';

/** Rumbo del viento a grados (como io_datos.php) */
const RUMBOS: Record<string, number | null> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5, CALMA: null
};

/** Imágenes GOES-19 del sur de Sudamérica (NOAA/NESDIS/STAR) */
const SATELITE_NOAA = 'https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/ssa/';
/** Rayos del GLM de GOES-19 sobre GeoColor, del mismo sector (cada 5 minutos) */
const RAYOS_NOAA = 'https://cdn.star.nesdis.noaa.gov/GOES19/GLM/SECTOR/ssa/EXTENT3/';
/** Recorte de 400 × 400 px de la imagen de 3600 × 2160: San Miguel de Tucumán (-26,83; -65,22) cae en (1423, 736) */
const RECORTE_NOA = 'cx=1223&cy=536&cw=400&ch=400&output=jpg&q=90';
/** Color de los rayos en la imagen: no aparece ni en GeoColor ni en la escala de Sandwich */
export const COLOR_RAYOS = [255, 43, 214];

export type ProductoSatelite = 'GEOCOLOR' | 'Sandwich';

/** Imagen satelital lista para mostrar; rayos: píxeles con rayos (null si no se pudieron traer) */
export interface ImagenSatelite { hora: Date; imagen: string; producto: ProductoSatelite; rayos: number | null }

/** «AAAADDDhhmm» (año, día del año y hora UTC), como NOAA nombra los archivos */
function selloNoaa(hora: Date): string {
  const diaDelAnio = Math.floor((hora.getTime() - Date.UTC(hora.getUTCFullYear(), 0, 1)) / 86400000) + 1;
  return `${hora.getUTCFullYear()}${String(diaDelAnio).padStart(3, '0')}`
    + `${String(hora.getUTCHours()).padStart(2, '0')}${String(hora.getUTCMinutes()).padStart(2, '0')}`;
}

function recorteWeserv(url: string): string {
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&${RECORTE_NOA}`;
}

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // weserv manda CORS: hace falta para leer los píxeles
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Píxel de color muy saturado y claro: así pinta NOAA los rayos; GeoColor de día no tiene ninguno */
function esSaturado(d: Uint8ClampedArray, i: number): boolean {
  const max = Math.max(d[i], d[i + 1], d[i + 2]);
  const min = Math.min(d[i], d[i + 1], d[i + 2]);
  return max > 153 && (max - min) > 0.6 * max;
}

/**
 * Pinta sobre la imagen base los rayos de la imagen GLM (GeoColor con los rayos en colores): se toman
 * los píxeles muy saturados que no lo son en la GeoColor del mismo momento (de noche, las luces de las
 * ciudades). Devuelve la imagen como JPEG en data URL y cuántos píxeles tienen rayos.
 */
async function componerRayos(baseUrl: string, rayosUrl: string, geocolorUrl: string): Promise<{ imagen: string; rayos: number }> {
  // De noche la base ya es la GeoColor: no se baja dos veces
  const [base, rayos, geocolor] = await Promise.all([
    cargarImagen(baseUrl),
    cargarImagen(rayosUrl),
    geocolorUrl === baseUrl ? null : cargarImagen(geocolorUrl),
  ]).then(([b, r, g]) => [b, r, g || b]);
  const lado = base.naturalWidth;
  const lienzo = document.createElement('canvas');
  lienzo.width = lado;
  lienzo.height = lado;
  const ctx = lienzo.getContext('2d');
  const pixeles = (img: HTMLImageElement) => {
    ctx.drawImage(img, 0, 0, lado, lado);
    return ctx.getImageData(0, 0, lado, lado).data;
  };
  const conRayos = pixeles(rayos);
  const fondo = pixeles(geocolor);
  ctx.drawImage(base, 0, 0, lado, lado);
  const salida = ctx.getImageData(0, 0, lado, lado);
  let cantidad = 0;
  for (let i = 0; i < conRayos.length; i += 4) {
    if (esSaturado(conRayos, i) && !esSaturado(fondo, i)) {
      salida.data.set(COLOR_RAYOS, i);
      cantidad++;
    }
  }
  ctx.putImageData(salida, 0, 0);
  return { imagen: lienzo.toDataURL('image/jpeg', 0.9), rayos: cantidad };
}

/** Sol al menos media hora sobre el horizonte en San Miguel de Tucumán (para la imagen Sandwich) */
function esDeDiaEnTucuman(hora: Date): boolean {
  const local = new Date(hora.getTime() - 3 * 3600000); // fecha de Argentina (UTC-3)
  const sol = salidaPuestaSol(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate(), -26.83, -65.22);
  const margen = 30 * 60000;
  return !!sol && hora.getTime() > sol.salidaMs + margen && hora.getTime() < sol.puestaMs - margen;
}

function fechaIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hoyIso(): string {
  return fechaIso(new Date());
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  d.setDate(d.getDate() + dias);
  return fechaIso(d);
}

/** Filas de una respuesta {status, data: [...]} de /services/ */
function datosDe(res: any): any[] {
  return Array.isArray(res?.data) ? res.data : [];
}

function promedio(valores: any[]): number | null {
  const n = valores.map(Number).filter(v => Number.isFinite(v));
  return n.length ? n.reduce((s, v) => s + v, 0) / n.length : null;
}

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
    this.avisarWidget();
  }

  getSelectedStation(): string | null {
    return localStorage.getItem('estacion');
  }

  /**
   * Favoritas del celular ('estacionesFavoritas') o, con sesión iniciada, copia de las de la cuenta
   * ('estacionesFavoritasCuenta', las sincroniza CuentaSyncService). Nunca se mezclan sin que el
   * usuario lo pida, como en la web.
   */
  private claveFavoritas = localStorage.getItem('cuenta') ? 'estacionesFavoritasCuenta' : 'estacionesFavoritas';
  private favoritesSubject = new BehaviorSubject<string[]>(this.readFavorites());
  favoritesChanged$ = this.favoritesSubject.asObservable();
  /** Sólo los cambios que hace el usuario (para mandarlos a la cuenta) */
  private favoritasEditadasSubject = new Subject<string[]>();
  favoritasEditadas$ = this.favoritasEditadasSubject.asObservable();

  /** Con la lista de la cuenta pasa a usarla; con null vuelve a las del celular (al cerrar sesión) */
  usarFavoritasDeCuenta(lista: string[] | null) {
    if (lista) {
      this.claveFavoritas = 'estacionesFavoritasCuenta';
      localStorage.setItem(this.claveFavoritas, JSON.stringify(lista.map(String)));
    } else {
      localStorage.removeItem('estacionesFavoritasCuenta');
      this.claveFavoritas = 'estacionesFavoritas';
    }
    this.favoritesSubject.next(this.readFavorites());
    this.avisarWidget();
  }

  /**
   * Quita de las favoritas (del celular y de la copia de la cuenta) las estaciones que ya no están
   * habilitadas: no aparecen en la lista de Estaciones, así que no se podían desmarcar. Sólo con una
   * lista razonable (al menos 10 estaciones), para no borrar favoritas por una respuesta incompleta.
   * Si cambian las de la cuenta, el aviso de edición hace que CuentaSyncService las guarde.
   */
  private quitarFavoritasDeshabilitadas(habilitadas: any[]) {
    if (habilitadas.length < 10) return;
    const ids = new Set(habilitadas.map(e => String(e?.Identificacion)));
    ['estacionesFavoritas', 'estacionesFavoritasCuenta'].forEach(clave => {
      let lista: string[];
      try { lista = JSON.parse(localStorage.getItem(clave) || 'null'); } catch { return; }
      if (!Array.isArray(lista)) return;
      const validas = lista.map(String).filter(id => ids.has(id));
      if (validas.length === lista.length) return;
      localStorage.setItem(clave, JSON.stringify(validas));
      if (clave === this.claveFavoritas) {
        this.favoritesSubject.next(validas);
        this.favoritasEditadasSubject.next(validas);
      }
    });
  }

  /** Las favoritas del celular, aunque haya sesión (para ofrecer agregarlas a la cuenta) */
  favoritasDelCelular(): string[] {
    try {
      const arr = JSON.parse(localStorage.getItem('estacionesFavoritas') || '[]');
      return Array.isArray(arr) ? arr.map(String) : [];
    } catch {
      return [];
    }
  }

  private readFavorites(): string[] {
    try {
      const raw = localStorage.getItem(this.claveFavoritas);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.map(String) : [];
    } catch {
      return [];
    }
  }

  getFavorites(): string[] {
    return this.favoritesSubject.value;
  }

  isFavorite(estacion: string | number): boolean {
    return this.favoritesSubject.value.includes(String(estacion));
  }

  toggleFavorite(estacion: string | number) {
    const id = String(estacion);
    const current = this.favoritesSubject.value;
    const next = current.includes(id)
      ? current.filter(x => x !== id)
      : [...current, id];

    localStorage.setItem(this.claveFavoritas, JSON.stringify(next));
    this.favoritesSubject.next(next);
    this.favoritasEditadasSubject.next(next);
    this.avisarWidget();
  }

  /**
   * Le pasa al widget las favoritas (o, si no hay, la estación elegida) con su último registro: el
   * de `elegido` si es una de ellas, si no el de la lista (`lista` o la guardada en 'estaciones').
   */
  private avisarWidget(lista?: any[], elegido?: any) {
    const favoritas = this.getFavorites();
    const ids = favoritas.length ? favoritas : [this.getSelectedStation()].filter((id): id is string => !!id);
    let todas = lista;
    if (!todas) {
      try { todas = JSON.parse(localStorage.getItem('estaciones') || '[]'); } catch { todas = []; }
    }
    const datos = ids
      .map(id => (elegido && String(elegido.Identificacion) === id)
        ? elegido
        : (todas || []).find(e => String(e?.Identificacion) === id))
      .filter(Boolean);
    actualizarWidget(ids, datos);
  }

  dato: any;
  private agrometBase = environment.agrometBase;
  private servicesBase = environment.servicesBase;
  private apiKey = environment.openWeatherApiKey;

  constructor(private http: HttpClient) { }

  getVersion(): Observable<any> {
    return this.http.get(`${this.agrometBase}io_version.php`)
      .pipe(catchError(() => of(null)));
  }

  /*
    Datos de las estaciones: salen de las APIs de la página web (/services/), las mismas que usa el
    sitio y con la misma depuración (los sensores dados de baja no se mandan). Cada método devuelve lo
    mismo que devolvían los io_*.php de /android/, así las pantallas no cambian. Los io_*.php siguen en
    el servidor para las versiones viejas de la app.
  */

  getPosts() {
    return this.http.get<any[]>(`${this.servicesBase}estaciones.php?habilitada=1`).pipe(
      map(res => (Array.isArray(res) ? res : []).map(e => this.estacionActual(e))),
      tap(lista => {
        if (!lista.length) return;
        this.quitarFavoritasDeshabilitadas(lista);
        this.avisarWidget(lista);
      }),
      catchError(err => {
        console.error('[SERVICE] getPosts() ERROR:', err);
        return of([]);
      })
    );
  }

  getDatos(estacion: string | number) {
    return this.http.get<any[]>(`${this.servicesBase}estaciones.php?estacion=${estacion}`).pipe(
      map(res => {
        const e = (Array.isArray(res) ? res : []).find(x => String(x?.Identificacion) === String(estacion));
        if (!e) return null;
        const dato = this.estacionActual(e);
        const grados = RUMBOS[String(dato.direc ?? '').toUpperCase().replace(/[^A-Z]/g, '')];
        if (grados !== undefined) dato.viento_dir = grados;
        this.avisarWidget(undefined, dato);
        return dato;
      }),
      catchError(err => {
        console.error('[SERVICE] getDatos() ERROR:', err);
        return of(null);
      })
    );
  }

  /**
   * estacion > 0: series de la estación [hoy por registro, últimos 30 días, promedios mensuales];
   * 0: máximas de hoy por estación; -1, -2, -3: heladas del día, del mes y por año (este y el anterior).
   */
  getTemperaturas(estacion: number): Observable<any> {
    let pedido: Observable<any>;
    if (estacion > 0) {
      pedido = this.seriesEstacion(estacion, 'temp_af', 'temperatura', ['temp_max', 'temp_min'],
        d => ({ fecha: d.fecha, t_max: d.temp_max, t_min: d.temp_min }),
        filas => ({ t_max: promedio(filas.map(f => f.temp_max)), t_min: promedio(filas.map(f => f.temp_min)) }));
    } else if (estacion === 0) {
      pedido = forkJoin([this.servicio('resumen-diario.php', { fecha: hoyIso() }), this.getPosts()]).pipe(
        map(([resumen, estaciones]) => {
          const porId = new Map((estaciones as any[]).map(e => [String(e.Identificacion), e]));
          return datosDe(resumen)
            .filter(f => f.temp_max != null && porId.has(String(f.identificacion)))
            .map(f => {
              const e = porId.get(String(f.identificacion));
              return { lat: e.lat, lon: e.lon, alt: e.alt, nombre: e.nombre, temperatura: f.temp_max };
            });
        }));
    } else if (estacion === -3) {
      const anio = new Date().getFullYear();
      pedido = forkJoin([
        this.heladas(`${anio - 1}-01-01`, `${anio - 1}-12-31`, String(anio - 1)),
        this.heladas(`${anio}-01-01`, hoyIso(), String(anio))
      ]).pipe(map(([previo, actual]) => [...previo, ...actual]
        .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)) || a.anio.localeCompare(b.anio))));
    } else {
      pedido = this.heladas(estacion === -2 ? hoyIso().slice(0, 8) + '01' : hoyIso(), hoyIso());
    }
    return pedido.pipe(catchError(() => of(null)));
  }

  /** Último registro de una estación (estaciones.php), con fecha y hora aparte como en io_estaciones.php */
  private estacionActual(e: any): any {
    const dato: any = {};
    // Sin el valor (no en null, que Number() lee como 0): las pantallas lo toman como faltante
    Object.keys(e ?? {}).forEach(k => { if (e[k] !== null) dato[k] = e[k]; });
    const fechaI = String(dato.fecha_I ?? '');
    if (fechaI.length >= 16) {
      dato.fecha = `${fechaI.slice(8, 10)}-${fechaI.slice(5, 7)}-${fechaI.slice(0, 4)}`;
      dato.hora = fechaI.slice(11, 16);
    }
    return dato;
  }

  /** Pedido a una API de /services/ */
  private servicio(archivo: string, params: Record<string, string | number>): Observable<any> {
    let p = new HttpParams();
    Object.keys(params).forEach(k => { p = p.set(k, String(params[k])); });
    return this.http.get(`${this.servicesBase}${archivo}`, { params: p });
  }

  /** Heladas por estación de un período (datos-heladas.php), como las devolvía io_temperaturas.php */
  private heladas(desde: string, hasta: string, anio?: string): Observable<any[]> {
    return this.servicio('datos-heladas.php', { desde, hasta }).pipe(
      map(res => datosDe(res)
        .filter(f => f.habilitada && f.minAbs != null) // sin minAbs: temperatura dada de baja
        .map(f => ({
          ...(anio ? { anio } : {}),
          lat: f.lat, lon: f.lon, alt: f.alt, nombre: f.nombre,
          temperatura: f.minAbs, duracion: f.maxHsDebajo0, registros: f.cantidadDias, dias: f.diasHeladas,
          fph: f.FPH, fuh: f.FUH, duracion_t: f.hsDebajo0, identificacion: f.identificacion
        }))));
  }

  /**
   * Series de una estación, como io_temperaturas.php e io_rr.php: [hoy por registro (datos-24hs.php),
   * últimos 30 días y totales o promedios por mes desde hace un año (datos-diarios.php)]. Los días sin
   * el valor (sensor dado de baja) no van.
   */
  private seriesEstacion(estacion: number, campoRegistro: string, nombreRegistro: string, camposDia: string[],
    dia: (d: any) => any, mes: (filas: any[]) => any): Observable<any[]> {
    const hoy = hoyIso();
    const hace30 = sumarDias(hoy, -30);
    // Desde el primer día del mes siguiente al de hace 365 días (como io_*.php)
    const haceUnAnio = sumarDias(hoy, -365);
    const inicio = new Date(Number(haceUnAnio.slice(0, 4)), Number(haceUnAnio.slice(5, 7)), 1);
    const desde = fechaIso(inicio);
    return forkJoin([
      this.servicio('datos-24hs.php', { fecha: hoy, estacion }),
      this.servicio('datos-diarios.php', { estacion, desde, hasta: hoy })
    ]).pipe(map(([registros, diarios]) => {
      const serieHoy = datosDe(registros)
        .filter(r => r[campoRegistro] != null)
        .map(r => ({ hora: String(r.hora).slice(0, 5), [nombreRegistro]: r[campoRegistro] }));
      const completo = (d: any) => camposDia.every(c => d[c] != null);
      const todos = datosDe(diarios);
      const serie30 = todos.filter(d => d.fecha >= hace30 && completo(d)).map(dia);
      // Un mes con algún día sin el valor (dado de baja) no va: su total quedaría corto
      const porMes = new Map<string, any[]>();
      todos.forEach(d => {
        const clave = String(d.fecha).slice(0, 7);
        porMes.set(clave, [...(porMes.get(clave) ?? []), d]);
      });
      const serieMes = [...porMes.entries()]
        .filter(([, filas]) => filas.every(completo))
        .map(([clave, filas]) => ({ anio: clave.slice(0, 4), mes: String(Number(clave.slice(5, 7))), ...mes(filas) }));
      return [serieHoy, serie30, serieMes];
    }));
  }

  // Reemplaza getTempMax/getTempMin/getHelDia/getHelMes/getHelAnio con:
  getTempMax() { return this.getTemperaturas(0); }
  getTempMin() { return this.getTemperaturas(-1); }
  getHelDia() { return this.getTemperaturas(-1); } // ojo: hoy está igual que TempMin (¿es intencional?)
  getHelMes() { return this.getTemperaturas(-2); }
  getHelAnio() { return this.getTemperaturas(-3); }

  /** estacion > 0: series de lluvia de la estación; 0: lluvia de las últimas 24 h por estación */
  getRR(estacion: number): Observable<any> {
    const pedido = estacion > 0
      ? this.seriesEstacion(estacion, 'lluvia', 'lluvia', ['rr_24'],
        d => ({ dia: d.fecha, lluvia: d.rr_24 }),
        filas => ({ lluvia: filas.reduce((s, f) => s + Number(f.rr_24), 0) }))
      : this.servicio('datos-alerta.php', { horas: 24 }).pipe(map(res => datosDe(res)
        .filter(f => Number(f.habilitada) > 0 && f.totalLluvia != null) // sin total: lluvia dada de baja
        .map(f => ({ lat: f.lat, lon: f.lon, alt: f.alt, nombre: f.nombre, lluvia: f.totalLluvia }))
        .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)))));
    return pedido.pipe(catchError(() => of(null)));
  }
  getRRMes(estacion: number) { return this.getRR(estacion); }
  getRR24() { return this.getRR(0); }

  /**
   * Última imagen satelital del NOA: recorte de 400 × 400 px (2 km por píxel) centrado en San Miguel de
   * Tucumán del sector «ssa» de GOES-19 de NOAA/NESDIS/STAR (dominio público, citar la fuente).
   * De día va «Sandwich» (la visible con las nubes frías coloreadas: topes de tormenta) y de noche
   * «GeoColor», porque Sandwich necesita la luz del sol. Encima van los rayos del GLM (en magenta),
   * que marcan las tormentas de día y de noche. El recorte lo hace images.weserv.nl, porque el
   * servidor de la EEAOC no tiene GD; los rayos se pintan en el celular (canvas).
   * NOAA publica cada 10 minutos, unos 15 después del barrido; el nombre del archivo trae la hora
   * (AAAADDDhhmm UTC), así que se prueba desde 15 minutos antes de la publicación de la última hacia atrás.
   * Es satélite y no radar: el radar del SMN no es de acceso público y RainViewer no cubre la Argentina.
   * null si NOAA o weserv no responden.
   */
  getSateliteNoa(): Observable<ImagenSatelite | null> {
    return from(this.ultimaImagenSatelite()).pipe(catchError(() => of(null)));
  }

  private async ultimaImagenSatelite(): Promise<ImagenSatelite | null> {
    const existe = (url: string) => this.http.head(url, { observe: 'response' }).toPromise().then(() => true, () => false);
    const archivo = (producto: ProductoSatelite, sello: string) =>
      `${SATELITE_NOAA}${producto}/${sello}_GOES19-ABI-ssa-${producto}-3600x2160.jpg`;

    // El parámetro evita que el celular reutilice la respuesta vieja (NOAA no manda Cache-Control)
    const ultima = await this.http.head(`${SATELITE_NOAA}GEOCOLOR/3600x2160.jpg?t=${Date.now()}`, { observe: 'response' }).toPromise();
    const publicada = Date.parse(ultima.headers.get('Last-Modified') || '');
    if (!Number.isFinite(publicada)) return null;

    // El barrido es unos 15 minutos anterior a la publicación: arrancar ahí evita pedir un archivo que
    // todavía no existe (el 404 queda en la consola del celular)
    const base = Math.floor((publicada - 15 * 60000) / 600000) * 600000;
    for (let i = 0; i < 4; i++) {
      const hora = new Date(base - i * 600000);
      const sello = selloNoaa(hora);
      if (!await existe(archivo('GEOCOLOR', sello))) continue;

      const producto: ProductoSatelite = esDeDiaEnTucuman(hora) && await existe(archivo('Sandwich', sello))
        ? 'Sandwich'
        : 'GEOCOLOR';
      const imagen = recorteWeserv(archivo(producto, sello));

      // Rayos: NOAA los publica con la hora del barrido + 1 minuto (o + 6), unos minutos después que las nubes
      for (const minutos of [1, -4]) {
        const rayos = `${RAYOS_NOAA}${selloNoaa(new Date(hora.getTime() + minutos * 60000))}_GOES19-GLM-ssa-EXTENT3-3600x2160.jpg`;
        if (await existe(rayos)) {
          const compuesta = await componerRayos(imagen, recorteWeserv(rayos), recorteWeserv(archivo('GEOCOLOR', sello)))
            .catch(() => null);
          if (compuesta) return { hora, producto, ...compuesta };
          break;
        }
      }
      return { hora, imagen, producto, rayos: null };
    }
    return null;
  }

  /** Lluvia normal de cada mes (enero a diciembre, mm; null sin dato) de normales.php; null si la estación no tiene */
  getLluviaNormal(estacion: number): Observable<(number | null)[] | null> {
    return this.servicio('normales.php', { estacion }).pipe(
      map((res: any) => {
        const rr = res?.normales?.rr;
        return Array.isArray(rr) && rr.length === 12
          ? rr.map((v: any) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v)))
          : null;
      }),
      catchError(() => of(null)));
  }

  getNoticias(): Observable<any> {
    return this.http.get(`${this.agrometBase}io_noticias.php`)
      .pipe(catchError(() => of([])));
  }

  getSmnAlertByArea(area: number, tipo = 1): Observable<any> {
    const params = new HttpParams().set('area', String(area)).set('tipo', String(tipo));
    return this.http
      .get(`${this.servicesBase}pronosticos/smn-alerta-area.php`, { params })
      .pipe(
        tap(res => console.log('[SMN] OK area', area, res)),
        catchError(err => {
          console.error('[SMN] ERROR area', area, err);
          return of(null);
        })
      );
  }

  getClimaActual(lat: number, lon: number): Observable<any> {
    return this.http.get(`${environment.openWeatherBase}weather?lat=${lat}&lon=${lon}&lang=es&units=metric&appid=${this.apiKey}`);
  }

  getPronostico(lat: number, lon: number): Observable<any> {
    return this.http.get(`${environment.openWeatherBase}forecast?lat=${lat}&lon=${lon}&lang=es&units=metric&appid=${this.apiKey}`);
  }

  getTemperatura24(estacion: string | number): Observable<any> {
    return this.getTemperaturas(Number(estacion));
  }

  getDatosCampaniaLluvia(mes: number, anio: number) {
    const url = `${this.servicesBase}datos-campania.php?mes=${mes}&anio=${anio}&tipo=2`;

    return this.http.get<any>(url);
  }

  getSmnWarning(): Observable<any> {
    return this.http.get(`${this.servicesBase}pronosticos/smn-warning.php`)
      .pipe(catchError(() => of(null)));
  }

  getResumenEstacion(estacion: string | number, desde: string, hasta: string): Observable<any> {
    const params = new HttpParams()
      .set('estacion', String(estacion))
      .set('desde', desde)
      .set('hasta', hasta);

    return this.http.get(`${this.servicesBase}datos-resumen.php`, { params })
      .pipe(catchError(() => of(null)));
  }

  getDatosDiarios(estacion: string | number, desde: string, hasta: string): Observable<any> {
    const params = new HttpParams()
      .set('estacion', String(estacion))
      .set('desde', desde)
      .set('hasta', hasta);

    return this.http.get(`${this.servicesBase}datos-diarios.php`, { params })
      .pipe(catchError(() => of(null)));
  }
}
