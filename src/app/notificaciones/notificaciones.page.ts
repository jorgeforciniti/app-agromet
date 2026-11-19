import { Component, OnInit } from '@angular/core';
import { LoadingController, ToastController } from '@ionic/angular';
import { AlertaUsuario, OpcionAlerta, PushPreferencias, PushService } from '../services/push.service';

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

      this.cargarAlertas();

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

  // ---------- Mis alertas (a medida, push-alertas.php) ----------

  alertas: AlertaUsuario[] = [];
  opciones: OpcionAlerta[] = [];
  maximoAlertas = 5;
  /** El formulario para agregar va cerrado: la sección muestra sólo la lista */
  agregando = false;
  estaciones: Array<{ id: string; nombre: string }> = [];
  nueva = { identificacion: '', variable: '', umbral: null as number | null };

  get opcionNueva(): OpcionAlerta | undefined {
    return this.opciones.find(o => o.variable === this.nueva.variable);
  }

  private async cargarAlertas() {
    const r = await this.pushService.alertas('listar');
    if (r.ok) this.aplicar(r);
  }

  abrirFormulario() {
    this.estaciones = (JSON.parse(localStorage.getItem('estaciones') || '[]') as any[])
      .map(e => ({ id: String(e.Identificacion), nombre: String(e.nombre) }));
    const primera = this.opciones[0];
    this.nueva = {
      identificacion: localStorage.getItem('estacion') || this.estaciones[0]?.id || '',
      variable: primera?.variable || '',
      umbral: null,
    };
    this.agregando = true;
  }

  async agregarAlerta() {
    const r = await this.pushService.alertas('agregar', {
      identificacion: Number(this.nueva.identificacion),
      variable: this.nueva.variable,
      umbral: Number(this.nueva.umbral),
    });
    if (r.ok) {
      this.aplicar(r);
      this.agregando = false;
    }
    await this.avisar(r.ok ? 'Alerta agregada.' : (r.error || 'No se pudo agregar la alerta.'), r.ok);
  }

  async borrarAlerta(a: AlertaUsuario) {
    const r = await this.pushService.alertas('borrar', { id: a.id });
    if (r.ok) this.aplicar(r);
    await this.avisar(r.ok ? 'Alerta borrada.' : (r.error || 'No se pudo borrar la alerta.'), r.ok);
  }

  /** «Temperatura por debajo de 2 °C» */
  textoAlerta(a: AlertaUsuario): string {
    return `${a.texto} ${String(a.umbral).replace('.', ',')} ${a.unidad}`;
  }

  private aplicar(r: { alertas?: AlertaUsuario[]; opciones?: OpcionAlerta[]; maximo?: number }) {
    this.alertas = r.alertas || [];
    this.opciones = r.opciones || this.opciones;
    this.maximoAlertas = r.maximo || this.maximoAlertas;
  }

  private async avisar(message: string, ok: boolean) {
    const toast = await this.toastCtrl.create({
      message, duration: 2200, position: 'bottom', color: ok ? 'success' : 'danger',
    });
    await toast.present();
  }
}