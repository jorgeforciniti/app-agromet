import { Component, OnDestroy, OnInit } from '@angular/core';
import { fechaDDMMAAAA } from '../shared/formato';
import { Router } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import { EstacionesService } from 'src/app/services/estaciones.service';

@Component({
  selector: 'app-resumen',
  templateUrl: './resumen.page.html',
  styleUrls: ['./resumen.page.scss'],
})
export class ResumenPage implements OnInit, OnDestroy {
  cargando = true;
  sinDatos = false;
  estacionNombre = '';
  rangoTexto = '';

  resumen: any = null;

  diarios: any[] = [];
  mostrarDetalleDiario = false;

  private stationSub?: Subscription;

  constructor(
    private estacionesService: EstacionesService,
    private router: Router
  ) { }

  ngOnInit() {
    this.cargar();

    this.stationSub = this.estacionesService.stationChanged$.subscribe(() => {
      this.cargar();
    });
  }

  ngOnDestroy() {
    this.stationSub?.unsubscribe();
  }

  refrescar(event: any) {
    this.cargar(() => event?.target?.complete?.());
  }

  private cargar(onDone?: () => void) {
    this.cargando = true;
    this.sinDatos = false;

    const dato = this.safeParse(localStorage.getItem('datos'));
    this.estacionNombre = dato?.nombre || '';

    const estacion = this.estacionesService.getSelectedStation();
    if (!estacion) {
      this.cargando = false;
      this.sinDatos = true;
      onDone?.();
      return;
    }

    const hoy = new Date();
    const hace6Dias = new Date(hoy);
    hace6Dias.setDate(hoy.getDate() - 6);

    const desde = this.fmtFecha(hace6Dias);
    const hasta = this.fmtFecha(hoy);
    this.rangoTexto = `${fechaDDMMAAAA(desde)} al ${fechaDDMMAAAA(hasta)}`;

    forkJoin({
      resumen: this.estacionesService.getResumenEstacion(estacion, desde, hasta),
      diarios: this.estacionesService.getDatosDiarios(estacion, desde, hasta),
    }).subscribe(({ resumen, diarios }) => {
      const fila = resumen?.data?.[0] || null;

      this.resumen = fila;
      this.sinDatos = !fila;
      this.diarios = Array.isArray(diarios?.data) ? diarios.data : [];

      this.cargando = false;
      onDone?.();
    });
  }

  toggleDetalleDiario() {
    this.mostrarDetalleDiario = !this.mostrarDetalleDiario;
  }

  fmtFechaCorta(iso: string): string {
    if (!iso || iso.length < 10) return iso;
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  }

  private fmtFecha(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  private safeParse(value: string | null) {
    if (!value) return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  goLocalidades() {
    this.router.navigate(['/localidades']);
  }
}
