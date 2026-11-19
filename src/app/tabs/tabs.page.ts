import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SinConexionService } from '../services/sin-conexion.interceptor';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss']
})
export class TabsPage {

  logo: string;

  /** «Sin conexión · datos guardados a las 10:30» (o «el 18/11 a las 10:30»); null con conexión */
  sinConexion$: Observable<string | null>;

  constructor(private router: Router, sinConexion: SinConexionService) {
    this.logo = 'assets/logo-agromet.png';
    this.sinConexion$ = sinConexion.guardadoDesde$.pipe(map(desde => {
      if (!desde) return null;
      const hora = desde.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as Intl.DateTimeFormatOptions);
      const hoy = desde.toDateString() === new Date().toDateString();
      const dia = desde.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
      return `Sin conexión · datos guardados ${hoy ? `a las ${hora}` : `el ${dia} a las ${hora}`}`;
    }));
  }

  goNotificaciones() {
    this.router.navigate(['/tabs/notificaciones']);
  }

}