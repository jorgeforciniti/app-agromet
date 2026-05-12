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

  publicidad: string;
  logo: string;

  constructor(
    private alertCtrl: AlertController,
    private platform: Platform
  ) {
    this.publicidad = 'https://agromet.eeaoc.gob.ar/android/prop1.gif';
    this.logo = 'assets/logo-agromet.png';
  }

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
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'iOS',
      message: 'En iPhone/iPad no se puede cerrar la app desde un botón. Usá el gesto Home o el selector de apps.',
      buttons: ['OK']
    });

    await alert.present();
  }
}