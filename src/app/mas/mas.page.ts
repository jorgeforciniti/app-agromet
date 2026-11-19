import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, Platform } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { CuentaService } from '../services/cuenta.service';

const SITIO_WEB = 'https://agromet.eeaoc.gob.ar';
const CORREO_CONTACTO = 'jorgeforciniti@eeaoc.org.ar';

@Component({
  selector: 'app-mas',
  templateUrl: './mas.page.html',
  styleUrls: ['./mas.page.scss'],
})
export class MasPage {

  constructor(
    private router: Router,
    private alertCtrl: AlertController,
    public platform: Platform,
    public cuenta: CuentaService
  ) { }

  goCuenta() {
    this.router.navigate(['/tabs/cuenta']);
  }

  goAplicaciones() {
    this.router.navigate(['/tabs/aplicaciones']);
  }

  goCuaderno() {
    this.router.navigate(['/tabs/cuaderno']);
  }

  goHerramientas() {
    this.router.navigate(['/tabs/herramientas']);
  }

  goLocalidades() {
    this.router.navigate(['/localidades']);
  }

  goComparar() {
    this.router.navigate(['/comparar']);
  }

  goNotificaciones() {
    this.router.navigate(['/tabs/notificaciones']);
  }

  abrirWeb() {
    window.open(SITIO_WEB, '_system');
  }

  // Mismo correo que el pie de la web
  escribir() {
    window.open(`mailto:${CORREO_CONTACTO}?subject=${encodeURIComponent('App Agromet')}`, '_system');
  }

  async acercaDe() {
    let version = '';
    try {
      version = Capacitor.isNativePlatform() ? (await App.getInfo()).version : '';
    } catch {
      version = '';
    }

    const alert = await this.alertCtrl.create({
      header: 'Agromet EEAOC',
      subHeader: version ? `Versión ${version}` : undefined,
      message:
        'Sección Agrometeorología de la Estación Experimental Agroindustrial Obispo Colombres (Tucumán).<br><br>' +
        'Datos de la red de estaciones de la EEAOC. Pronóstico: OpenWeatherMap y Open-Meteo (heladas). Alertas: Servicio Meteorológico ' +
        'Nacional. Índice Kp: NOAA SWPC.<br><br>' +
        'Los datos son provisorios y pueden estar sujetos a revisión. La EEAOC no asume responsabilidad por su ' +
        'uso, interpretación o aplicación.',
      buttons: ['Cerrar'],
    });

    await alert.present();
  }

  // Estaba como botón rojo fijo en la franja superior (tabs); acá no compite con las alertas
  async confirmSalir() {
    const alert = await this.alertCtrl.create({
      header: 'Salir',
      message: '¿Querés cerrar la aplicación?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Salir',
          role: 'destructive',
          handler: () => this.salir()
        }
      ]
    });

    await alert.present();
  }

  async salir() {
    if (!Capacitor.isNativePlatform()) {
      window.close();
      return;
    }

    if (this.platform.is('android')) {
      App.exitApp();
    }
  }
}
