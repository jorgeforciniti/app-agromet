import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { NavController, LoadingController } from '@ionic/angular';
import { Router } from '@angular/router';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { Subject, timer, forkJoin, from, of, defer, merge } from 'rxjs';
import {
  finalize,
  switchMap,
  takeUntil,
  tap,
  catchError,
  timeout,
  distinctUntilChanged, map
} from 'rxjs/operators';


@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private lastStation: string | null = null;
  private refresh$ = new Subject<void>();

  alertas: any[] = [];
  alertaHoy: any = null;
  smnAlertsByArea: { [area: number]: any[] } = {};
  maxAlertLevel: number = 0;

  dato: any = {};
  message: any = {};

  dia: string;
  semana: any[] = [];
  nombreMes: string;
  anio: string;
  hora: string;
  diaSemana: string;

  mensajes: any = {};
  msj: any = {};

  imagen: string;
  ubicacion: string;
  icono: string;
  uv = '';

  iconosD: any[] = [];
  maximasD: any[] = [];
  minimasD: any[] = [];
  datosH: any[] = [];

  constructor(
    private pronostico: EstacionesService,
    private router: Router,
    public loadingCtrl: LoadingController,
    public navCtrl: NavController,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    merge(
      timer(0, 600000).pipe(map(() => void 0)),
      this.refresh$,
      this.pronostico.stationChanged$.pipe(
        tap((est) => {
          if (est && est !== this.lastStation) {
            this.lastStation = est;
          }
        }),
        map(() => void 0)
      )
    )
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.refreshAll())
      )
      .subscribe();
  }

  ionViewDidEnter() {
    const est = localStorage.getItem('estacion');

    if (est && est !== this.lastStation) {
      this.lastStation = est;
      this.refresh$.next();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  refreshAll() {
    return defer(() =>
      from(
        this.loadingCtrl.create({
          spinner: 'bubbles',
          translucent: true,
          cssClass: 'custom-class custom-loading',
          showBackdrop: false,
          message: 'Cargando...',
        })
      ).pipe(
        switchMap((loadingEl) =>
          from(loadingEl.present()).pipe(
            switchMap(() => {
              const estacionReq = localStorage.getItem('estacion');

              if (!estacionReq || estacionReq === '0') {
                this.router.navigate(['/localidades']);
                return of(null);
              }

              // 1) Datos estación
              return this.pronostico.getDatos(estacionReq).pipe(
                timeout(12000),
                tap((posts: any) => {
                  // si cambió estación, no piso
                  if (localStorage.getItem('estacion') !== estacionReq) return;

                  localStorage.setItem('datos', JSON.stringify(posts));
                  this.dato = posts ?? {};
                  this.cargarDatos();
                  this.cargarImagen();
                  this.cdr.markForCheck();
                }),

                // 2) clima + forecast + alertas
                switchMap(() => {
                  if (localStorage.getItem('estacion') !== estacionReq) return of(null);

                  const lat = Number(this.dato?.lat);
                  const lon = Number(this.dato?.lon);

                  const clima$ =
                    !lat || !lon
                      ? of(null)
                      : this.pronostico.getClimaActual(lat, lon).pipe(
                        timeout(12000),
                        catchError((e) => {
                          console.log('[HOME] ERROR climaActual:', e);
                          return of(null);
                        })
                      );

                  const forecast$ =
                    !lat || !lon
                      ? of(null)
                      : this.pronostico.getPronostico(lat, lon).pipe(
                        timeout(12000),
                        catchError((e) => {
                          console.log('[HOME] ERROR pronostico:', e);
                          return of(null);
                        })
                      );

                  const alertasTuc$ = this.pronostico.getSmnAlertByArea(3373).pipe(
                    timeout(12000),
                    catchError((e) => {
                      console.log('[HOME] ERROR alertasTuc:', e);
                      return of(null);
                    })
                  );

                  const alertasValles$ = this.pronostico.getSmnAlertByArea(3375).pipe(
                    timeout(12000),
                    catchError((e) => {
                      console.log('[HOME] ERROR alertasValles:', e);
                      return of(null);
                    })
                  );

                  return forkJoin({
                    clima: clima$,
                    forecast: forecast$,
                    alertasTuc: alertasTuc$,
                    alertasValles: alertasValles$,
                  }).pipe(
                    timeout(15000),
                    catchError(() => of(null))
                  );
                }),

                tap((res: any) => {
                  if (!res) return;
                  if (localStorage.getItem('estacion') !== estacionReq) return;

                  const { clima, forecast, alertasTuc, alertasValles } = res;

                  // OWM
                  if (clima?.weather?.[0]?.icon) {
                    this.msj = clima;
                    this.icono = '../../assets/w-icons/' + clima.weather[0].icon + '.png';
                  }
                  if (forecast?.list && forecast?.cnt) {
                    this.mensajes = forecast;
                    this.datosH = this.buildDatosH(forecast);
                  }

                  // ALERTAS (según estación seleccionada)
                  this.alertas = [];
                  this.smnAlertsByArea = { 3373: [], 3375: [] };
                  this.maxAlertLevel = 0;

                  if (alertasTuc?.warnings?.length) this.smnAlertsByArea[3373] = alertasTuc.warnings;
                  if (alertasValles?.warnings?.length) this.smnAlertsByArea[3375] = alertasValles.warnings;

                  const esValles = [10, 11, 12, 31].includes(Number(estacionReq));
                  const nombreArea = esValles ? 'Valles Calchaquíes' : 'Tucumán';
                  const dataElegida = esValles ? alertasValles : alertasTuc;

                  if (dataElegida?.warnings?.length) {
                    const list = this.parseAlertasPorArea(nombreArea, dataElegida)
                      .filter(a => (a?.nivel ?? 0) >= 3);

                    this.alertas = list;
                    for (const a of list) this.maxAlertLevel = Math.max(this.maxAlertLevel, a?.nivel ?? 0);
                  }

                  this.alertas.sort((a, b) => {
                    const nb = (b?.nivel ?? 0) - (a?.nivel ?? 0);
                    if (nb !== 0) return nb;
                    return String(a?.dateISO ?? '').localeCompare(String(b?.dateISO ?? ''));
                  });

                  this.cdr.markForCheck();
                }),

                catchError((err) => {
                  console.log('[HOME] ERROR refreshAll:', err);
                  return of(null);
                })
              );
            }),
            finalize(() => loadingEl.dismiss().catch(() => { }))
          )
        )
      )
    );
  }

  private hasAlerta(data: any): boolean {
    return !!(data?.reports?.length);
  }

  private parseAlerta(data: any) {
    const hoy = data?.warnings?.[0] ?? null;

    // Tomamos el primer reporte (si querés, después lo hacemos “por max_level”)
    const rep = data?.reports?.[0] ?? null;
    const level0 = rep?.levels?.[0] ?? null;

    return {
      updated: data?.updated ?? null,
      fecha: hoy?.date ?? null,
      nivel: hoy?.max_level ?? rep?.levels?.[0]?.level ?? 0,
      descripcion: level0?.description ?? '',
      instruccion: level0?.instruction ?? '',
    };
  }

  cargarDatos() {
    this.semana = [];

    // dato ya asignado antes, pero lo aseguramos:
    this.dato = this.dato || this.safeParse(localStorage.getItem('datos')) || {};

    const fechaI = this.dato.fecha_I;
    if (!fechaI || typeof fechaI !== 'string' || fechaI.length < 16) return;

    this.dia = fechaI.substr(8, 2);
    const mes = fechaI.substr(5, 2);
    this.anio = fechaI.substr(0, 4);

    const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    const diasCortos = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    const dt = new Date(`${mes} ${this.dia}, ${this.anio}`);
    this.diaSemana = dias[dt.getUTCDay()];
    this.nombreMes = meses[parseInt(mes, 10) - 1];

    for (let i = dt.getUTCDay() + 1; i < dt.getUTCDay() + 8; i++) {
      if (i > 6) this.semana.push(diasCortos[i - 7]);
      else this.semana.push(diasCortos[i]);
    }

    this.hora = fechaI.substr(11, 5);

    // Normalizaciones (sin reventar si vienen null/string raro)
    this.dato.temp_af = Number(this.dato.temp_af);
    this.dato.hum_af = Math.round(parseInt(this.dato.hum_af, 10));
    this.dato.presion = Math.round(parseInt(this.dato.presion, 10));
    this.dato.RR_dia = Math.round(parseInt(this.dato.RR_dia, 10));
    this.dato.rr_15 = parseFloat(this.dato.rr_15);
    this.dato.viento_max = Math.round(parseInt(this.dato.viento_max, 10));
  }

  onClick() {
    this.router.navigate(['/localidades']);
  }

  cargarImagen() {
    if (!this.dato) return;

    if (this.dato.temp_af < 30) {
      if (this.dato.temp_af < 0) {
        this.imagen = '../../assets/fondos/inicio-heladas.jpg';
      } else {
        this.imagen = '../../assets/fondos/inicio-soleado.jpg';
      }
    } else {
      this.imagen = '../../assets/fondos/inicio-temperatura-alta.jpg';
    }

    if (this.dato.RR_dia > 1) {
      this.imagen = '../../assets/fondos/inicio-rr.jpg';
    }

    this.ubicacion = '../../assets/wheater-icons/ubicacion.png';
  }

  private buildDatosH(mensajes: any): any[] {
    const out: any[] = [];
    let ban = 0;

    for (let i = 1; i < mensajes.cnt; i++) {
      const dt = new Date(mensajes.list[i].dt * 1000);
      const fecha = dt.getDate();

      const utcDay = dt.getUTCDate();
      const utcMonth = dt.getUTCMonth() + 1;
      const utcYear = dt.getUTCFullYear();
      const formattedDate = `${utcDay.toString().padStart(2, '0')}/${utcMonth
        .toString()
        .padStart(2, '0')}/${utcYear}`;

      if (ban !== fecha) {
        ban = fecha;
        out.push([formattedDate, 0, 0, 0, 0, 0]);
      }

      out.push([
        0,
        dt.getHours() + ':00',
        '../../assets/w-icons/' + mensajes.list[i].weather[0].icon + '.png',
        mensajes.list[i].main.temp.toFixed(0),
        mensajes.list[i].main.humidity.toFixed(0),
        (mensajes.list[i].wind.speed * 3.6).toFixed(0),
        mensajes.list[i].weather[0].description,
      ]);
    }

    return out;
  }

  private safeParse(value: string | null) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  refrescar(event: any) {
    const sub = this.refreshAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        complete: () => event?.target?.complete?.(),
        error: () => event?.target?.complete?.(),
      });
    setTimeout(() => event?.target?.complete?.(), 15000);
  }

  private getAlertLabel(level: number): string {
    switch (level) {
      case 3:
        return 'ALERTA AMARILLO';
      case 4:
        return 'ALERTA NARANJA';
      case 5:
        return 'ALERTA ROJO';
      default:
        return 'ALERTAS';
    }
  }

  private parseAlertasPorArea(area: string, data: any): any[] {
    const out: any[] = [];

    const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
    const reports = Array.isArray(data?.reports) ? data.reports : [];

    for (const w of warnings) {
      const moments = this.buildMomentsLabel(w);
      const dateISO = String(w?.date ?? '');
      const fecha = this.formatDateDDMMYYYY(dateISO); // "05-02-2026"

      // Elegimos el evento “principal” del día: el de mayor max_level
      const events = Array.isArray(w?.events) ? w.events : [];
      const topEvent = events.reduce((best, cur) => {
        const a = best?.max_level ?? 0;
        const b = cur?.max_level ?? 0;
        return b > a ? cur : best;
      }, null);

      // Buscamos el reporte textual para ese event_id (si existe)
      const rep = reports.find((r: any) => String(r?.event_id) === String(topEvent?.id));
      const level0 = rep?.levels?.[0] ?? null;

      out.push({
        area,
        nivel: Number(w?.max_level ?? topEvent?.max_level ?? 0),
        fecha: moments ? `${fecha} (${moments})` : fecha, // 👈 lo que pediste
        dateISO, // para ordenar
        descripcion: level0?.description ?? '',
        instruccion: level0?.instruction ?? '',
      });
    }

    return out;
  }

  private buildMomentsLabel(warning: any): string {
    const events = Array.isArray(warning?.events) ? warning.events : [];
    const present = new Set<string>();

    for (const ev of events) {
      const lv = ev?.levels ?? {};

      if (lv.early_morning != null && Number(lv.early_morning) > 0) present.add('madrugada');
      if (lv.morning != null && Number(lv.morning) > 0) present.add('mañana');
      if (lv.afternoon != null && Number(lv.afternoon) > 0) present.add('tarde');
      if (lv.night != null && Number(lv.night) > 0) present.add('noche');
    }

    const order = ['madrugada', 'mañana', 'tarde', 'noche'];
    const out = order.filter(x => present.has(x));

    return out.join(', ');
  }

  private formatDateDDMMYYYY(dateISO: string): string {
    // esperado: "2026-02-05"
    if (!dateISO || dateISO.length < 10) return dateISO;

    const y = dateISO.slice(0, 4);
    const m = dateISO.slice(5, 7);
    const d = dateISO.slice(8, 10);

    return `${d}-${m}-${y}`;
  }

  private isVallesStation(estacionId: string | number | null): boolean {
    const id = Number(estacionId);
    return [10, 11, 12, 31].includes(id);
  }

  get aplicarOk(): boolean {
    const d = this.dato || {};
    return !(
      d.temp_af >= 30 ||
      d.hum_af <= 55 ||
      d.rr_15 > 0 ||
      d.viento_max > 10
    );
  }

  get aplicarTexto(): string {
    return this.aplicarOk ? 'Favorable para aplicar' : 'No aplicar agroquímicos';
  }

  get aplicarMotivos(): string[] {
    const d = this.dato || {};
    const out: string[] = [];
    if (d.temp_af >= 30) out.push('Temperatura alta');
    if (d.hum_af <= 55) out.push('Humedad baja');
    if (d.rr_15 > 0) out.push('Lluvia reciente');
    if (d.viento_medio > 10) { out.push('Viento fuerte') } else {
      if (d.viento_max > 10) out.push('Ráfagas fuertes');
    }
    return out;
  }

  showForecastAll = false;
  showAlertsAll = false;

  // Pronóstico corto (para no mostrar la tabla eterna)
  get datosHShort(): any[] {
    if (!Array.isArray(this.datosH)) return [];
    const out: any[] = [];

    for (const item of this.datosH) {
      // tus headers de fecha tienen item[0] != 0
      if (item[0] !== 0) continue;

      out.push(item);
      if (out.length >= 10) break; // ajustá 8/10/12 según quieras
    }
    return out;
  }

  // Alertas visibles (para colapsar)

  get alertasVisibles(): any[] {
    if (!Array.isArray(this.alertas)) return [];
    return this.showAlertsAll ? this.alertas : this.alertas.slice(0, 2);
  }

  fmt1(n: any): string {
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(1) : 'S/D';
  }
  fmt0(n: any): string {
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(0) : 'S/D';
  }

}