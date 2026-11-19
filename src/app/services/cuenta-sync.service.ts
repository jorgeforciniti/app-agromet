import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AlertController } from '@ionic/angular';
import { BehaviorSubject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { CuentaService } from './cuenta.service';
import { CuadernoService, RegistroAplicacion } from './cuaderno.service';
import { EstacionesService } from './estaciones.service';

/** Ya se ofreció pasar las favoritas del celular a esta cuenta (uid) */
const CLAVE_OFRECIDO = 'cuentaFavoritasOfrecidas';
/** Estación predeterminada de la cuenta (la elige la web): se reenvía al guardar las favoritas */
const CLAVE_PREDETERMINADA = 'cuentaPredeterminada';

export type EstadoSync = 'sin-sesion' | 'sincronizando' | 'ok' | 'error';

/**
 * Sincroniza con la cuenta las favoritas (preferencias.php, la misma API que la web) y el cuaderno de
 * aplicaciones (cuaderno.php). Se crea al arrancar la app (AppComponent) y:
 * - al iniciar sesión trae las favoritas de la cuenta; si la cuenta no tiene y el celular sí, ofrece
 *   una vez agregarlas (como la web), y sube el cuaderno anotado en el celular;
 * - con sesión, cada cambio de favoritas o del cuaderno se manda a la cuenta;
 * - al cerrar sesión vuelven las favoritas del celular y el cuaderno de la cuenta se borra del celular.
 */
@Injectable({ providedIn: 'root' })
export class CuentaSyncService {

  private estadoSubject = new BehaviorSubject<EstadoSync>('sin-sesion');
  estado$ = this.estadoSubject.asObservable();

  constructor(
    private http: HttpClient,
    private cuenta: CuentaService,
    private cuaderno: CuadernoService,
    private estaciones: EstacionesService,
    private alertCtrl: AlertController,
  ) {
    this.cuenta.sesion$.pipe(map(s => s?.uid ?? null), distinctUntilChanged()).subscribe(uid => {
      if (uid) this.sincronizarTodo(); else this.estadoSubject.next('sin-sesion');
    });
    this.estaciones.favoritasEditadas$.pipe(debounceTime(1000)).subscribe(lista => {
      if (this.cuenta.sesion) this.guardarFavoritas(lista);
    });
    this.cuaderno.editado$.pipe(debounceTime(500)).subscribe(() => {
      if (this.cuenta.sesion) this.sincronizarCuaderno();
    });
  }

  async sincronizarTodo() {
    this.estadoSubject.next('sincronizando');
    const ok = (await this.traerFavoritas()) && (await this.sincronizarCuaderno());
    this.estadoSubject.next(ok ? 'ok' : 'error');
  }

  /** Sube lo pendiente del cuaderno (anotaciones y borrados) y trae el de la cuenta */
  async sincronizarCuaderno(): Promise<boolean> {
    const headers = await this.cuenta.encabezados();
    if (!headers) return false;
    try {
      const pendientes = this.cuaderno.pendientes();
      for (let i = 0; i < pendientes.length; i += 200) {
        const registros = pendientes.slice(i, i + 200).map(r => ({
          uid: r.id, fecha: r.fecha, lote: r.lote, producto: r.producto, dosis: r.dosis, notas: r.notas,
          condiciones: r.condiciones,
        }));
        await this.http.post(`${environment.usuariosBase}cuaderno.php`, { registros }, { headers }).toPromise();
      }
      const borrados = this.cuaderno.borrados();
      for (const uid of borrados) {
        await this.http.post(`${environment.usuariosBase}cuaderno_borrar.php`, { uid }, { headers }).toPromise();
      }
      this.cuaderno.quitarBorrados(borrados);

      const r: any = await this.http.get(`${environment.usuariosBase}cuaderno.php`, { headers }).toPromise();
      const cuenta: RegistroAplicacion[] = (r?.cuaderno ?? []).map((c: any) => ({
        id: c.uid, fecha: c.fecha, lote: c.lote, producto: c.producto, dosis: c.dosis, notas: c.notas,
        condiciones: c.condiciones ?? null,
      }));
      this.cuaderno.reemplazarConCuenta(cuenta);
      if (this.estadoSubject.value === 'error') this.estadoSubject.next('ok');
      return true;
    } catch (e) {
      console.error('[CUENTA] No se pudo sincronizar el cuaderno', e);
      this.estadoSubject.next('error');
      return false;
    }
  }

  /** Cierra la sesión: antes intenta subir lo pendiente del cuaderno, que si no se perdería */
  async cerrarSesion(): Promise<void> {
    if (this.cuaderno.pendientes().length || this.cuaderno.borrados().length) {
      const subido = await this.sincronizarCuaderno();
      if (!subido) {
        const seguir = await this.confirmar('Hay anotaciones sin subir',
          'No se pudieron guardar en tu cuenta (¿sin conexión?). Si cerrás la sesión se pierden.', 'Cerrar igual');
        if (!seguir) return;
      }
    }
    this.limpiarSesion();
  }

  /** Borra la cuenta y sus datos (Más → Cuenta); en el celular queda como sin sesión */
  async borrarCuenta(): Promise<void> {
    await this.cuenta.borrarCuenta();
    this.limpiarSesion();
  }

  private limpiarSesion() {
    this.cuenta.salir();
    localStorage.removeItem(CLAVE_PREDETERMINADA);
    this.estaciones.usarFavoritasDeCuenta(null);
    this.cuaderno.vaciar();
  }

  private async traerFavoritas(): Promise<boolean> {
    const headers = await this.cuenta.encabezados();
    if (!headers) return false;
    try {
      const r: any = await this.http.get(`${environment.usuariosBase}preferencias.php`, { headers }).toPromise();
      let favoritas: string[] = (r?.favoritas ?? []).map(String);
      localStorage.setItem(CLAVE_PREDETERMINADA, r?.predeterminada ?? '');

      const delCelular = this.estaciones.favoritasDelCelular();
      const uid = this.cuenta.sesion?.uid ?? '';
      if (!favoritas.length && delCelular.length && localStorage.getItem(CLAVE_OFRECIDO) !== uid) {
        localStorage.setItem(CLAVE_OFRECIDO, uid);
        const n = delCelular.length;
        const agregar = await this.confirmar('Favoritas',
          `¿Agregar a tu cuenta ${n === 1 ? 'la favorita' : `las ${n} favoritas`} de este celular?`, 'Agregar');
        if (agregar) {
          favoritas = delCelular;
          await this.guardarFavoritas(favoritas);
        }
      }
      this.estaciones.usarFavoritasDeCuenta(favoritas);
      return true;
    } catch (e) {
      console.error('[CUENTA] No se pudieron traer las favoritas', e);
      // Sin red sigue con la copia guardada de la cuenta
      if (!localStorage.getItem('estacionesFavoritasCuenta')) this.estaciones.usarFavoritasDeCuenta([]);
      return false;
    }
  }

  /** preferencias.php reemplaza todo: se reenvía la predeterminada que eligió la web (si sigue en la lista) */
  private async guardarFavoritas(favoritas: string[]) {
    const headers = await this.cuenta.encabezados();
    if (!headers) return;
    const predeterminada = localStorage.getItem(CLAVE_PREDETERMINADA) || null;
    try {
      await this.http.post(`${environment.usuariosBase}preferencias.php`, {
        favoritas,
        predeterminada: predeterminada && favoritas.includes(predeterminada) ? predeterminada : null,
      }, { headers }).toPromise();
    } catch (e) {
      console.error('[CUENTA] No se pudieron guardar las favoritas', e);
      this.estadoSubject.next('error');
    }
  }

  private async confirmar(header: string, message: string, si: string): Promise<boolean> {
    const alerta = await this.alertCtrl.create({
      header, message,
      buttons: [{ text: 'No', role: 'cancel' }, { text: si, role: 'confirm' }],
    });
    await alerta.present();
    const { role } = await alerta.onDidDismiss();
    return role === 'confirm';
  }
}
