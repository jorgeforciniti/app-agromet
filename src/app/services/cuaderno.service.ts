import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/** Condiciones al momento de anotar, tomadas de la pantalla Aplicaciones */
export interface CondicionesAplicacion {
  estacion: string | null;
  tC: number | null;
  rh: number | null;
  vientoKmh: number | null;
  rafagaKmh: number | null;
  direccion: string | null;
  deltaT: number | null;
  semaforo: 'VERDE' | 'AMARILLO' | 'ROJO';
  /** Algún valor fue estimado con OpenWeatherMap (la estación no lo tenía o estaba atrasada) */
  estimado: boolean;
  metodo: string;
  cultivo: string;
}

export interface RegistroAplicacion {
  /** Lo genera el celular; en la cuenta es el `uid` de la anotación */
  id: string;
  /** «2026-11-19T10:30» en la hora del celular */
  fecha: string;
  lote: string;
  producto: string;
  dosis: string;
  notas: string;
  condiciones: CondicionesAplicacion | null;
  /** Ya está en la cuenta (con sesión iniciada) */
  sincronizado?: boolean;
}

const CLAVE = 'cuadernoAplicaciones';
/** Anotaciones de la cuenta borradas en el celular y todavía no en el servidor */
const CLAVE_BORRADOS = 'cuadernoBorrados';

/**
 * Cuaderno de aplicaciones guardado en el celular (localStorage). Con sesión iniciada además se
 * sincroniza con la cuenta (CuentaSyncService): lo anotado sin conexión queda marcado sin
 * `sincronizado` y se sube después. `condicionesPendientes` lleva las condiciones de Aplicaciones
 * al formulario del Cuaderno.
 */
@Injectable({ providedIn: 'root' })
export class CuadernoService {

  condicionesPendientes: CondicionesAplicacion | null = null;

  /** Cambios del usuario (para subirlos a la cuenta) */
  private editadoSubject = new Subject<void>();
  editado$ = this.editadoSubject.asObservable();
  /** La lista cambió (también por la sincronización), para redibujar el Cuaderno */
  private cambioSubject = new Subject<void>();
  cambio$ = this.cambioSubject.asObservable();

  /** Del más nuevo al más viejo */
  lista(): RegistroAplicacion[] {
    const lista = leerLista(CLAVE);
    return lista.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  }

  agregar(registro: Omit<RegistroAplicacion, 'id' | 'sincronizado'>): void {
    const lista = this.lista();
    lista.push({ ...registro, id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`, sincronizado: false });
    this.guardar(lista);
    this.editadoSubject.next();
  }

  borrar(id: string): void {
    const lista = this.lista();
    const borrado = lista.find(r => r.id === id);
    if (borrado?.sincronizado) localStorage.setItem(CLAVE_BORRADOS, JSON.stringify([...this.borrados(), id]));
    this.guardar(lista.filter(r => r.id !== id));
    this.editadoSubject.next();
  }

  /** El último registro, para proponer el mismo lote y producto */
  ultimo(): RegistroAplicacion | null {
    return this.lista()[0] ?? null;
  }

  // ---- Para la sincronización con la cuenta ----

  pendientes(): RegistroAplicacion[] {
    return this.lista().filter(r => !r.sincronizado);
  }

  borrados(): string[] {
    return leerLista(CLAVE_BORRADOS).map(String);
  }

  quitarBorrados(ids: string[]) {
    localStorage.setItem(CLAVE_BORRADOS, JSON.stringify(this.borrados().filter(id => !ids.includes(id))));
  }

  /** Lo de la cuenta más lo anotado en el celular que todavía no se subió */
  reemplazarConCuenta(cuenta: RegistroAplicacion[]) {
    const borrados = this.borrados();
    const enCuenta = new Set(cuenta.map(r => r.id));
    const locales = this.pendientes().filter(r => !enCuenta.has(r.id));
    this.guardar([...cuenta.filter(r => !borrados.includes(r.id)).map(r => ({ ...r, sincronizado: true })), ...locales]);
  }

  /** Al cerrar sesión: lo de la cuenta no queda en el celular */
  vaciar() {
    localStorage.removeItem(CLAVE);
    localStorage.removeItem(CLAVE_BORRADOS);
    this.cambioSubject.next();
  }

  private guardar(lista: RegistroAplicacion[]) {
    localStorage.setItem(CLAVE, JSON.stringify(lista));
    this.cambioSubject.next();
  }
}

function leerLista(clave: string): any[] {
  try {
    const lista = JSON.parse(localStorage.getItem(clave) || '[]');
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}
