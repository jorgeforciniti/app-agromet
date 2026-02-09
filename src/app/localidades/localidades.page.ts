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
  ) {}

  ngOnInit() {
    this.mensajes = JSON.parse(localStorage.getItem('estaciones') || '[]');
  }

  onClick(estacion: any) {
    const id = estacion?.Identificacion ?? estacion?.identificacion ?? estacion?.id;
    if (!id) return;

    // 1) set estación + emitir cambio
    this.estacionesService.setSelectedStation(id);

    // 2) limpiar cache de datos para evitar “mostrar lo viejo”
    localStorage.removeItem('datos');

    // 3) flags como ya hacías
    localStorage.setItem('temperatura', '1');
    localStorage.setItem('home', '1');
    localStorage.setItem('lluvia', '1');
    localStorage.setItem('helada', '1');

    // 4) volver al tab home (1 sola navegación)
    this.navCtrl.navigateBack('/tabs/home');
  }
}
