import { Injectable } from '@angular/core';
import {
  HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpResponse
} from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

/** Datos que se guardan para usar sin conexión: los de la Sección y los pronósticos */
const ORIGENES = [environment.servicesBase, environment.agrometBase, environment.openWeatherBase, environment.openMeteoUrl];
const PREFIJO = 'sinConexion:';
/** Respuestas guardadas como máximo (cambiar de estación suma las de cada una): se borran las más viejas */
const MAXIMO = 60;

/**
 * Estado «sin conexión»: la hora de lo guardado más viejo que se está mostrando, o null si todo
 * llegó del servidor. Lo muestra la franja de las pestañas (tabs.page).
 */
@Injectable({ providedIn: 'root' })
export class SinConexionService {
  private guardadoDesde = new BehaviorSubject<Date | null>(null);
  guardadoDesde$ = this.guardadoDesde.asObservable();

  usaGuardado(t: number) {
    const actual = this.guardadoDesde.value;
    if (!actual || t < actual.getTime()) this.guardadoDesde.next(new Date(t));
  }

  enLinea() {
    if (this.guardadoDesde.value) this.guardadoDesde.next(null);
  }
}

/**
 * Uso sin conexión: guarda la última respuesta de cada consulta (GET) en localStorage y, si el
 * pedido falla por falta de red, devuelve la guardada en lugar del error. Así las pantallas no
 * cambian: reciben lo mismo que la última vez y la franja avisa de qué hora son los datos.
 *
 * Las consultas «hasta hoy» llevan la fecha del día (datos-24hs.php?fecha=…, datos-diarios.php?hasta=…),
 * así que para la clave las fechas se pasan a relativas (hoy, hace N días, día 1 de hace N meses):
 * mañana sin señal se muestra lo guardado hoy. Las de otros períodos (Herramientas) sólo con la
 * consulta exacta.
 */
@Injectable()
export class SinConexionInterceptor implements HttpInterceptor {

  constructor(private estado: SinConexionService) { }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Lo de la cuenta (/services/usuarios/) no se guarda: es de cada usuario y lleva su token
    const clave = req.method === 'GET' && ORIGENES.some(o => o && req.url.startsWith(o))
      && !req.url.startsWith(environment.usuariosBase)
      ? claveCache(req.urlWithParams)
      : null;
    if (!clave) return next.handle(req);

    return next.handle(req).pipe(
      tap(evento => {
        if (evento instanceof HttpResponse && evento.status === 200) {
          guardar(clave, evento.body);
          this.estado.enLinea();
        }
      }),
      catchError((err: HttpErrorResponse) => {
        // status 0: no hubo respuesta (sin red); los errores del servidor no se tapan
        const guardado = err?.status === 0 ? leer(clave) : null;
        if (!guardado) return throwError(err);
        this.estado.usaGuardado(guardado.t);
        return of(new HttpResponse({ body: guardado.body, status: 200, url: req.urlWithParams }));
      })
    );
  }
}

/** «2026-11-19» de hoy en la hora del celular */
function hoyLocal(): string {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

function claveCache(url: string): string {
  const u = new URL(url);
  const hoy = hoyLocal();
  const fechas = ['fecha', 'desde', 'hasta'];
  const hastaHoy = ['fecha', 'hasta'].some(p => u.searchParams.get(p) === hoy);
  if (hastaHoy) {
    fechas.forEach(p => {
      const f = u.searchParams.get(p);
      if (f && /^\d{4}-\d{2}-\d{2}$/.test(f)) u.searchParams.set(p, relativa(f, hoy));
    });
  }
  u.searchParams.sort();
  return PREFIJO + u.toString();
}

/** «hoy», «m-11» (día 1 de hace 11 meses) o «d-30» (hace 30 días) */
function relativa(f: string, hoy: string): string {
  if (f === hoy) return 'hoy';
  if (f.endsWith('-01')) {
    const meses = (Number(hoy.slice(0, 4)) - Number(f.slice(0, 4))) * 12 + Number(hoy.slice(5, 7)) - Number(f.slice(5, 7));
    return `m-${meses}`;
  }
  const dias = Math.round((Date.parse(hoy) - Date.parse(f)) / 86400000);
  return `d-${dias}`;
}

/** Hora de cada respuesta guardada, para borrar las más viejas sin leerlas todas */
const INDICE = 'sinConexion#indice';

function leerIndice(): Record<string, number> {
  try {
    const indice = JSON.parse(localStorage.getItem(INDICE) || '{}');
    return indice && typeof indice === 'object' ? indice : {};
  } catch {
    return {};
  }
}

function leer(clave: string): { t: number; body: any } | null {
  try {
    const g = JSON.parse(localStorage.getItem(clave) || 'null');
    return g && typeof g.t === 'number' ? g : null;
  } catch {
    return null;
  }
}

function guardar(clave: string, body: any) {
  const t = Date.now();
  const valor = JSON.stringify({ t, body });
  const indice = leerIndice();
  indice[clave] = t;
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // Lleno: se hace lugar borrando las más viejas y se prueba una vez más
    borrarViejos(indice, MAXIMO / 2, clave);
    try { localStorage.setItem(clave, valor); } catch { delete indice[clave]; }
  }
  borrarViejos(indice, MAXIMO, clave);
  try { localStorage.setItem(INDICE, JSON.stringify(indice)); } catch { /* sin lugar */ }
}

function borrarViejos(indice: Record<string, number>, maximo: number, salvo: string) {
  const claves = Object.keys(indice).filter(c => c !== salvo);
  if (claves.length < maximo) return;
  claves.sort((a, b) => indice[a] - indice[b])
    .slice(0, claves.length - maximo + 1)
    .forEach(c => {
      localStorage.removeItem(c);
      delete indice[c];
    });
}
