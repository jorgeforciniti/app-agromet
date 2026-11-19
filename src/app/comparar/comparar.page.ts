import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { EstacionesService } from 'src/app/services/estaciones.service';

interface FilaComparacion {
  id: string;
  nombre: string;
  temp: number | null;
  humedad: number | null;
  viento: number | null;
  lluviaHoy: number | null;
  esActual: boolean;
}

@Component({
  selector: 'app-comparar',
  templateUrl: './comparar.page.html',
  styleUrls: ['./comparar.page.scss'],
})
export class CompararPage implements OnInit {
  cargando = true;
  filas: FilaComparacion[] = [];

  constructor(
    private estacionesService: EstacionesService,
    private router: Router
  ) { }

  ngOnInit() {
    this.cargar();
  }

  private cargar() {
    const favIds = this.estacionesService.getFavorites();

    if (!favIds.length) {
      this.cargando = false;
      return;
    }

    const estacionActual = this.estacionesService.getSelectedStation();
    const estaciones = this.safeParse(localStorage.getItem('estaciones')) || [];

    const calls: { [id: string]: any } = {};
    favIds.forEach(id => {
      calls[id] = this.estacionesService.getDatos(id).pipe(catchError(() => of(null)));
    });

    forkJoin(calls).subscribe((res: any) => {
      this.filas = favIds.map(id => {
        const dato = res[id];
        const estMeta = estaciones.find((e: any) =>
          String(e?.Identificacion ?? e?.identificacion ?? e?.id) === id
        );

        return {
          id,
          nombre: dato?.nombre || estMeta?.nombre || id,
          temp: this.toNum(dato?.temp_af),
          humedad: this.toNum(dato?.hum_af),
          viento: this.toNum(dato?.viento_medio),
          lluviaHoy: this.toNum(dato?.RR_dia),
          esActual: id === estacionActual,
        };
      });

      this.cargando = false;
    });
  }

  seleccionar(id: string) {
    this.estacionesService.setSelectedStation(id);
    this.router.navigate(['/tabs/home']);
  }

  private toNum(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private safeParse(value: string | null) {
    if (!value) return null;
    try { return JSON.parse(value); } catch { return null; }
  }
}
