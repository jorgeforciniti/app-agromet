import { Component, OnInit } from '@angular/core';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { NavController } from '@ionic/angular';

@Component({
  selector: 'app-localidades',
  templateUrl: './localidades.page.html',
  styleUrls: ['./localidades.page.scss'],
})
export class LocalidadesPage implements OnInit {
  mensajes: any[] = [];

  constructor(
    private estacionesService: EstacionesService,
    private navCtrl: NavController
  ) { }

  ngOnInit() {
    this.mensajes = JSON.parse(localStorage.getItem('estaciones') || '[]');
  }

  onClick(estacion: any) {
    const id = estacion?.Identificacion ?? estacion?.identificacion ?? estacion?.id;
    if (!id) return;

    this.estacionesService.setSelectedStation(id);

    localStorage.removeItem('datos');

    this.navCtrl.navigateBack('/tabs/home');
  }
}
