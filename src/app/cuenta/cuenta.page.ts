import { Component } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { Observable } from 'rxjs';
import { CuentaService } from '../services/cuenta.service';
import { CuentaSyncService, EstadoSync } from '../services/cuenta-sync.service';
import { googleDisponible, idTokenDeGoogle } from '../services/google-login';

/**
 * Cuenta compartida con la web (misma cuenta que agromet.eeaoc.gob.ar): con la sesión iniciada, las
 * favoritas y el cuaderno de aplicaciones quedan guardados en la cuenta. La app funciona igual sin cuenta.
 */
@Component({
  selector: 'app-cuenta',
  templateUrl: './cuenta.page.html',
  styleUrls: ['./cuenta.page.scss'],
})
export class CuentaPage {

  modo: 'ingresar' | 'crear' = 'ingresar';
  email = '';
  password = '';
  enviando = false;
  error = '';
  aviso = '';

  google = googleDisponible();
  estado$: Observable<EstadoSync>;

  constructor(
    public cuenta: CuentaService,
    private sync: CuentaSyncService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
  ) {
    this.estado$ = this.sync.estado$;
  }

  cambiarModo(modo: 'ingresar' | 'crear') {
    this.modo = modo;
    this.error = '';
    this.aviso = '';
  }

  async enviar() {
    if (!this.email.trim() || !this.password) return;
    await this.intentar(async () => {
      if (this.modo === 'ingresar') {
        await this.cuenta.ingresar(this.email.trim(), this.password);
      } else {
        await this.cuenta.crear(this.email.trim(), this.password);
        this.mostrar('Cuenta creada. Te mandamos un correo para confirmar la dirección.');
      }
      this.password = '';
    });
  }

  async conGoogle() {
    await this.intentar(async () => {
      const idToken = await idTokenDeGoogle();
      if (idToken) await this.cuenta.ingresarConGoogle(idToken);
    });
  }

  async recuperar() {
    if (!this.email.trim()) {
      this.error = 'Escribí tu correo y volvé a tocar «Olvidé mi contraseña».';
      return;
    }
    await this.intentar(async () => {
      await this.cuenta.recuperarContrasena(this.email.trim());
      this.aviso = 'Te mandamos un correo para cambiar la contraseña.';
    });
  }

  sincronizar() {
    this.sync.sincronizarTodo();
  }

  salir() {
    this.sync.cerrarSesion();
  }

  async borrarCuenta() {
    const alerta = await this.alertCtrl.create({
      header: 'Borrar mi cuenta',
      message: 'Se borran la cuenta (también para el sitio web), las favoritas guardadas en ella y el cuaderno de aplicaciones. No se puede deshacer.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Borrar', role: 'destructive' },
      ],
    });
    await alerta.present();
    const { role } = await alerta.onDidDismiss();
    if (role !== 'destructive') return;
    await this.intentar(async () => {
      await this.sync.borrarCuenta();
      this.mostrar('La cuenta se borró.');
    });
  }

  estadoTexto(estado: EstadoSync): string {
    switch (estado) {
      case 'sincronizando': return 'Sincronizando…';
      case 'error': return 'No se pudo sincronizar (¿sin conexión?). Se reintenta con el próximo cambio.';
      default: return 'Favoritas y cuaderno de aplicaciones al día con tu cuenta.';
    }
  }

  private async intentar(accion: () => Promise<void>) {
    this.enviando = true;
    this.error = '';
    this.aviso = '';
    try {
      await accion();
    } catch (e) {
      this.error = (e as Error)?.message || 'No se pudo completar la operación. Volvé a intentar.';
    } finally {
      this.enviando = false;
    }
  }

  private async mostrar(message: string) {
    const toast = await this.toastCtrl.create({ message, duration: 3500 });
    await toast.present();
  }
}
