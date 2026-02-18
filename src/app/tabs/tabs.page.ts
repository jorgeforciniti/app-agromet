import { Component } from '@angular/core';
import { AlertController, Platform } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss']
})
export class TabsPage {

  home: string;
  temperaturas: string;
  lluvias: string;
  publicidad: string;
  heladas: string;
  aplicaciones: string;
  logo: string;

  constructor(private alertCtrl: AlertController,
    private platform: Platform) {
    // Reutilizamos el ícono existente de Eventos para la nueva pestaña.
    // Si más adelante agregás un ícono propio, cambiá la ruta.
    this.publicidad = 'https://agromet.eeaoc.gob.ar/android/prop1.gif';
    this.logo = '../../assets/logo-agromet.png';
  }

  async confirmSalir() {
    const alert = await this.alertCtrl.create({
      header: 'Salir',
      message: '¿Querés cerrar la aplicación?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
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
    // Solo tiene sentido en nativo
    if (!Capacitor.isNativePlatform()) {
      // En web no se puede cerrar “bien”
      window.close();
      return;
    }

    // Android: OK
    if (this.platform.is('android')) {
      App.exitApp();
      return;
    }

    // iOS: no se debe cerrar programáticamente
    const alert = await this.alertCtrl.create({
      header: 'iOS',
      message: 'En iPhone/iPad no se puede cerrar la app desde un botón. Usá el gesto Home o el selector de apps.',
      buttons: ['OK']
    });
    await alert.present();
  }
}
