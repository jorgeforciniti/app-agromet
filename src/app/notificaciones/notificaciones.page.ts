import { Component, OnInit } from '@angular/core';
import { LoadingController, ToastController } from '@ionic/angular';
import { PushPreferencias, PushService } from '../services/push.service';

@Component({
  selector: 'app-notificaciones',
  templateUrl: './notificaciones.page.html',
  styleUrls: ['./notificaciones.page.scss'],
})
export class NotificacionesPage implements OnInit {

  loading = false;
  error = '';

  pref: PushPreferencias = {
    heladas_activo: 1,
    heladas_alcance: 'provincia',
    smn_activo: 1,
    smn_area_3373: 1,
    smn_area_3375: 1,
  };

  constructor(
    private pushService: PushService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) { }

  async ngOnInit() {
    await this.cargar();
  }

  async cargar() {
    this.error = '';

    const loading = await this.loadingCtrl.create({
      message: 'Cargando preferencias...',
      spinner: 'crescent',
    });

    await loading.present();

    try {
      if (!this.pushService.esPlataformaNativa()) {
        this.error =
          'La configuración de notificaciones solo está disponible en la app instalada en el celular. En navegador no se genera token push.';
        return;
      }

      await this.pushService.registrarTokenActual();

      if (!this.pushService.tieneTokenRegistrado()) {
        this.error =
          'Todavía no se pudo registrar este dispositivo para recibir notificaciones. Cerrá y abrí la app nuevamente o verificá el permiso de notificaciones.';
        return;
      }

      const pref = await this.pushService.obtenerPreferencias();

      if (pref) {
        this.pref = {
          ...this.pref,
          ...pref,
          heladas_activo: Number(pref.heladas_activo),
          smn_activo: Number(pref.smn_activo),
          smn_area_3373: Number(pref.smn_area_3373),
          smn_area_3375: Number(pref.smn_area_3375),
        };
      } else {
        this.error = 'No se pudieron obtener las preferencias.';
      }
    } finally {
      loading.dismiss().catch(() => { });
    }
  }

  async guardar() {
    if (!this.pushService.esPlataformaNativa() || !this.pushService.tieneTokenRegistrado()) {
      const toast = await this.toastCtrl.create({
        message: 'Las preferencias solo se pueden guardar desde la app instalada en el celular.',
        duration: 2500,
        position: 'bottom',
        color: 'warning',
      });

      await toast.present();
      return;
    }

    if (!this.pref.smn_area_3373 && !this.pref.smn_area_3375) {
      this.pref.smn_activo = 0;
    }

    const ok = await this.pushService.guardarPreferencias(this.pref);

    const toast = await this.toastCtrl.create({
      message: ok ? 'Preferencias guardadas.' : 'No se pudieron guardar las preferencias.',
      duration: 2200,
      position: 'bottom',
      color: ok ? 'success' : 'danger',
    });

    await toast.present();
  }

  onToggleSmnArea() {
    if (!this.pref.smn_area_3373 && !this.pref.smn_area_3375) {
      this.pref.smn_activo = 0;
    } else {
      this.pref.smn_activo = 1;
    }
  }
}