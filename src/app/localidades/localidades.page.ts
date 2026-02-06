import { Component, OnInit } from '@angular/core';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-localidades',
  templateUrl: './localidades.page.html',
  styleUrls: ['./localidades.page.scss'],
})
export class LocalidadesPage implements OnInit {

  mensajes: any[] = [];

  constructor(private estacionesService: EstacionesService, private router: Router) { }

  ngOnInit() {
    this.mensajes = JSON.parse(localStorage.getItem('estaciones') || '[]');
  }

  onClick(check: any) {
    const estacionId =
      check?.Identificacion ?? check?.identificacion ?? check?.ID ?? check?.id;

    if (estacionId == null) {
      console.log('[LOCALIDADES] estación sin Identificacion:', check);
      return;
    }

    this.estacionesService.setSelectedStation(estacionId);
    localStorage.setItem('temperatura', '1');
    localStorage.setItem('home', '1');
    localStorage.setItem('lluvia', '1');
    localStorage.setItem('helada', '1');

    this.router.navigateByUrl('/tabs/home');
  }
}
