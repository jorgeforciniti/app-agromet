import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { AlertController, LoadingController, NavController } from '@ionic/angular';
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
  map,
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

  // ====== DATA ======
  dato: any = {};
  mensajes: any = {}; // forecast OWM
  msj: any = {};      // climaActual OWM
  datosH: any[] = []; // forecast “tabla”

  // ====== UI ======
  imagen: string = '';
  icono: string = '';
  ubicacion: string = '../../assets/wheater-icons/ubicacion.png';

  dia: string = '';
  nombreMes: string = '';
  anio: string = '';
  hora: string = '';
  diaSemana: string = '';

  showForecastAll = false;
  showAlertsAll = false;

  // ====== ALERTAS ======
  alertas: Array<any> = [];
  maxAlertLevel: number = 0;

  // ====== ESTIMACIONES (flags) ======
  estimated = {
    temp: false,
    hum: false,
    wind: false,
    pres: false,
    rain: false,
  };

  // icon fallback
  iconFallback = '../../assets/w-icons/na.png';

  constructor(
    private pronostico: EstacionesService,
    private router: Router,
    public loadingCtrl: LoadingController,
    public navCtrl: NavController,
    private cdr: ChangeDetectorRef,
    private alertCtrl: AlertController
  ) { }

  ngOnInit() {
    merge(
      timer(0, 600000).pipe(map(() => void 0)),
      this.refresh$,
      this.pronostico.stationChanged$.pipe(
        tap((est) => {
          if (est && est !== this.lastStation) this.lastStation = est;
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

  // ---------- GETTERS PRESENTACIÓN ----------
  get localidadLabel(): string {
    return (this.dato?.nombre || this.dato?.Nombre || this.dato?.localidad || '—').toString();
  }

  get saludo(): string {
    const hStr = (this.hora || '').slice(0, 2);
    const h = Number(hStr);
    const hour = Number.isFinite(h) ? h : new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Buenos días,';
    if (hour >= 12 && hour < 20) return 'Buenas tardes,';
    return 'Buenas noches,';
  }

  // ---------- REFRESH ----------
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

              return this.pronostico.getDatos(estacionReq).pipe(
                timeout(12000),
                tap((posts: any) => {
                  if (localStorage.getItem('estacion') !== estacionReq) return;

                  localStorage.setItem('datos', JSON.stringify(posts));
                  this.dato = posts ?? {};
                  this.cargarDatos();
                  this.cargarImagen();
                  this.cdr.markForCheck();
                }),

                switchMap(() => {
                  if (localStorage.getItem('estacion') !== estacionReq) return of(null);

                  const lat = Number(this.dato?.lat);
                  const lon = Number(this.dato?.lon);

                  const clima$ =
                    !lat || !lon ? of(null) : this.pronostico.getClimaActual(lat, lon).pipe(
                      timeout(12000),
                      catchError((e) => { console.log('[HOME] ERROR climaActual:', e); return of(null); })
                    );

                  const forecast$ =
                    !lat || !lon ? of(null) : this.pronostico.getPronostico(lat, lon).pipe(
                      timeout(12000),
                      catchError((e) => { console.log('[HOME] ERROR pronostico:', e); return of(null); })
                    );

                  const alertasTuc$ = this.pronostico.getSmnAlertByArea(3373).pipe(
                    timeout(12000),
                    catchError((e) => { console.log('[HOME] ERROR alertasTuc:', e); return of(null); })
                  );

                  const alertasValles$ = this.pronostico.getSmnAlertByArea(3375).pipe(
                    timeout(12000),
                    catchError((e) => { console.log('[HOME] ERROR alertasValles:', e); return of(null); })
                  );

                  return forkJoin({
                    clima: clima$,
                    forecast: forecast$,
                    alertasTuc: alertasTuc$,
                    alertasValles: alertasValles$,
                  }).pipe(timeout(15000), catchError(() => of(null)));
                }),

                tap((res: any) => {
                  if (!res) return;
                  if (localStorage.getItem('estacion') !== estacionReq) return;

                  const { clima, forecast, alertasTuc, alertasValles } = res;
                  this.msj = clima ?? {};
                  this.mensajes = forecast ?? {};

                  this.reconcileStationWithOWM(this.msj);

                  const owmIcon = this.msj?.weather?.[0]?.icon;
                  this.icono = owmIcon ? ('../../assets/w-icons/' + owmIcon + '.png') : (this.icono || this.iconFallback);

                  this.datosH = (this.mensajes?.list && this.mensajes?.cnt) ? this.buildDatosH(this.mensajes) : [];

                  const estacionNum = Number(estacionReq);
                  const esValles = [10, 11, 12, 31].includes(estacionNum);
                  const nombreArea = esValles ? 'Valles Calchaquíes' : 'Tucumán';
                  const dataElegida = esValles ? alertasValles : alertasTuc;

                  const listAll = dataElegida?.warnings?.length ? this.parseAlertasPorArea(nombreArea, dataElegida) : [];
                  const list = listAll.filter((a) => (a?.nivel ?? 0) >= 3);

                  this.alertas = list;
                  this.maxAlertLevel = 0;
                  for (const a of list) this.maxAlertLevel = Math.max(this.maxAlertLevel, a?.nivel ?? 0);

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

  // ====== VALIDACIÓN + REEMPLAZO POR ESTIMACIÓN (OWM) ======
  private reconcileStationWithOWM(climaOWM: any) {
    // reset flags
    this.estimated = { temp: false, hum: false, wind: false, pres: false, rain: false };

    if (!climaOWM?.main) return;

    const alt = this.toNum(this.dato?.alt ?? this.dato?.altura ?? null);

    // Estación
    const stTemp = this.toNum(this.dato?.temp_af);
    const stHum = this.toNum(this.dato?.hum_af);
    const stWind = this.toNum(this.dato?.viento_medio);
    const stPres = this.toNum(this.dato?.presion);

    // OWM
    const oTemp = this.toNum(climaOWM?.main?.temp);
    const oHum = this.toNum(climaOWM?.main?.humidity);
    const oWind = this.toNum(climaOWM?.wind?.speed) != null ? (Number(climaOWM.wind.speed) * 3.6) : null; // m/s→km/h
    const seaLevel = this.toNum(climaOWM?.main?.sea_level ?? climaOWM?.main?.pressure);
    const grndLevel = this.toNum(climaOWM?.main?.grnd_level);

    // presión estación desde OWM
    const oPresStation =
      alt != null
        ? this.pressureAtStationFromSeaLevel(seaLevel, alt)
        : (grndLevel ?? null);

    // Reglas plausibilidad “duro”
    const badTemp = stTemp == null || stTemp < -15 || stTemp > 55;
    const badHum = stHum == null || stHum < 2 || stHum > 100;
    const badWind = stWind == null || stWind < 0 || stWind > 220;
    const badPres = stPres == null || stPres < 500 || stPres > 1100;

    // Reglas “comparativas” (si difiere demasiado, tomar OWM)
    const tempDiff = (stTemp != null && oTemp != null) ? Math.abs(stTemp - oTemp) : null;
    const humDiff = (stHum != null && oHum != null) ? Math.abs(stHum - oHum) : null;
    const windDiff = (stWind != null && oWind != null) ? Math.abs(stWind - oWind) : null;
    const presDiff = (stPres != null && oPresStation != null) ? Math.abs(stPres - oPresStation) : null;

    const suspiciousTemp = tempDiff != null && tempDiff >= 15;
    const suspiciousHum = humDiff != null && humDiff >= 25;
    const suspiciousWind = windDiff != null && windDiff >= 5;
    const suspiciousPres = presDiff != null && presDiff >= 18;

    // Aplicar reemplazos (solo si hay valor OWM)
    if ((badTemp || suspiciousTemp) && oTemp != null) {
      this.dato.temp_af = oTemp;
      this.estimated.temp = true;
    }
    if ((badHum || suspiciousHum) && oHum != null) {
      this.dato.hum_af = Math.round(oHum);
      this.estimated.hum = true;
    }
    if ((badWind || suspiciousWind) && oWind != null) {
      this.dato.viento_medio = Math.round(oWind);
      this.estimated.wind = true;
    }
    if ((badPres || suspiciousPres) && oPresStation != null) {
      this.dato.presion = Math.round(oPresStation);
      this.estimated.pres = true;
    }

    // lluvia diaria: si falta o es absurda, no hay “daily rain” confiable en current-weather.
    // Lo dejamos en estación, pero marcamos si está fuera de rango.
    const stRain = this.toNum(this.dato?.RR_dia);
    if (stRain == null || stRain < 0 || stRain > 250) {
      // no reemplazamos por OWM (no equivalente directo)
      this.estimated.rain = true; // solo para avisar “dato no fiable”
    }
  }

  // Barométrica (aprox) para convertir presión nivel mar -> estación
  private pressureAtStationFromSeaLevel(pSea: number | null, altitudeM: number): number | null {
    if (pSea == null) return null;
    if (!Number.isFinite(altitudeM)) return null;

    // Fórmula ISA simplificada (buena para uso operativo)
    // P = P0 * (1 - (L*h)/T0)^(g*M/(R*L))
    const P0 = pSea;
    const h = altitudeM;
    const T0 = 288.15;
    const L = 0.0065;
    const g = 9.80665;
    const M = 0.0289644;
    const R = 8.31447;

    const base = 1 - (L * h) / T0;
    if (base <= 0) return null;

    const exp = (g * M) / (R * L);
    return P0 * Math.pow(base, exp);
  }

  // ====== DATOS ESTACIÓN: fecha, etc ======
  cargarDatos() {
    this.dato = this.dato || this.safeParse(localStorage.getItem('datos')) || {};

    const fechaI = this.dato.fecha_I;
    if (!fechaI || typeof fechaI !== 'string' || fechaI.length < 16) return;

    this.dia = fechaI.substr(8, 2);
    const mes = fechaI.substr(5, 2);
    this.anio = fechaI.substr(0, 4);

    const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    const dt = new Date(`${mes} ${this.dia}, ${this.anio}`);
    this.diaSemana = dias[dt.getUTCDay()];
    this.nombreMes = meses[parseInt(mes, 10) - 1];

    this.hora = fechaI.substr(11, 5);

    // normaliza números
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
      if (this.dato.temp_af < 0) this.imagen = '../../assets/fondos/inicio-heladas.jpg';
      else this.imagen = '../../assets/fondos/inicio-soleado.jpg';
    } else {
      this.imagen = '../../assets/fondos/inicio-temperatura-alta.jpg';
    }

    if (this.dato.RR_dia > 1) this.imagen = '../../assets/fondos/inicio-rr.jpg';
  }

  // ====== PRONÓSTICO ======
  private buildDatosH(mensajes: any): any[] {
    const out: any[] = [];
    let currentDayKey = '';

    const tz = Number(mensajes?.city?.timezone ?? 0); // segundos (OWM)

    const list = Array.isArray(mensajes?.list) ? mensajes.list : [];
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const local = this.owmLocalDate(it?.dt, tz);

      // clave de día local (YYYY-MM-DD) para agrupar
      const y = local.getUTCFullYear();
      const m = (local.getUTCMonth() + 1).toString().padStart(2, '0');
      const d = local.getUTCDate().toString().padStart(2, '0');
      const dayKey = `${y}-${m}-${d}`;

      // header por día
      if (dayKey !== currentDayKey) {
        currentDayKey = dayKey;
        out.push([`${d}/${m}/${y}`, 0, 0, 0, 0, 0]);
      }

      // hora local (ya “ajustada”)
      const hh = local.getUTCHours().toString().padStart(2, '0');

      out.push([
        0,
        `${hh}:00`,
        '../../assets/w-icons/' + (it?.weather?.[0]?.icon ?? 'na') + '.png',
        Number(it?.main?.temp ?? 0).toFixed(0),
        Number(it?.main?.humidity ?? 0).toFixed(0),
        (Number(it?.wind?.speed ?? 0) * 3.6).toFixed(0),
        it?.weather?.[0]?.description ?? '',
      ]);
    }

    return out;
  }

  // Convierte dt (UTC epoch seconds) a "fecha local" usando timezone del forecast.
  // OJO: devuelve Date "corrida", por eso luego usamos getUTC* para leer.
  private owmLocalDate(dtSeconds: any, tzSeconds: number): Date {
    const dt = Number(dtSeconds);
    const tz = Number(tzSeconds);
    return new Date((dt + (Number.isFinite(tz) ? tz : 0)) * 1000);
  }


  get datosHShort(): any[] {
    if (!Array.isArray(this.datosH) || this.datosH.length === 0) return [];

    const out: any[] = [];
    let started = false;

    for (const item of this.datosH) {
      const isHeader = item?.[0] !== 0;

      if (isHeader) {
        if (!started) {
          started = true;
          continue;
        } else {
          break;
        }
      }

      if (started && item?.[0] === 0) out.push(item);
    }

    return out;
  }

  get forecastDias(): Array<{ label: string; rows: any[] }> {
    if (!Array.isArray(this.datosH) || this.datosH.length === 0) return [];

    const out: Array<{ label: string; rows: any[] }> = [];
    let current: { label: string; rows: any[] } | null = null;

    for (const item of this.datosH) {
      if (!Array.isArray(item)) continue;

      const isHeader = item[0] !== 0;
      if (isHeader) {
        const rawDate = String(item[0] ?? '');
        const label = this.formatForecastHeader(rawDate);
        current = { label, rows: [] };
        out.push(current);
        continue;
      }

      if (item[0] === 0) {
        if (!current) {
          current = { label: 'Hoy', rows: [] };
          out.push(current);
        }
        current.rows.push(item);
      }
    }

    return out.filter(g => g.rows.length > 0);
  }

  private formatForecastHeader(dateStr: string): string {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateStr);
    if (!m) return dateStr;

    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);

    const date = new Date(yyyy, mm - 1, dd);
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

    const diaNombre = dias[date.getDay()] ?? '';
    const mesNombre = meses[mm - 1] ?? '';
    return `${diaNombre} ${String(dd).padStart(2, '0')}-${mesNombre}`;
  }

  toggleForecast() {
    this.showForecastAll = !this.showForecastAll;
  }

  imgError(ev: Event) {
    const img = ev.target as HTMLImageElement;
    if (!img) return;
    img.src = this.iconFallback;
    img.classList.add('icon-fallback');
  }

  // ====== ALERTAS ======
  get alertasVisibles(): any[] {
    if (!Array.isArray(this.alertas)) return [];
    return this.showAlertsAll ? this.alertas : this.alertas.slice(0, 2);
  }

  private parseAlertasPorArea(area: string, data: any): any[] {
    const out: any[] = [];
    const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
    const reports = Array.isArray(data?.reports) ? data.reports : [];

    for (const w of warnings) {
      const moments = this.buildMomentsLabel(w);
      const dateISO = String(w?.date ?? '');
      const fecha = this.formatDateDDMMYYYY(dateISO);

      const events = Array.isArray(w?.events) ? w.events : [];
      const topEvent = events.reduce((best, cur) => {
        const a = best?.max_level ?? 0;
        const b = cur?.max_level ?? 0;
        return b > a ? cur : best;
      }, null);

      const rep = reports.find((r: any) => String(r?.event_id) === String(topEvent?.id));
      const level0 = rep?.levels?.[0] ?? null;

      out.push({
        area,
        nivel: Number(w?.max_level ?? topEvent?.max_level ?? 0),
        fecha: moments ? `${fecha} (${moments})` : fecha,
        dateISO,
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
    return order.filter((x) => present.has(x)).join(', ');
  }

  private formatDateDDMMYYYY(dateISO: string): string {
    if (!dateISO || dateISO.length < 10) return dateISO;
    const y = dateISO.slice(0, 4);
    const m = dateISO.slice(5, 7);
    const d = dateISO.slice(8, 10);
    return `${d}-${m}-${y}`;
  }

  // ====== RECOMENDACIÓN AGRO ======
  get aplicarOk(): boolean {
    const d = this.dato || {};
    return !(d.temp_af >= 30 || d.hum_af <= 55 || d.rr_15 > 0 || d.viento_max > 10);
  }

  get aplicarTexto(): string {
    return this.aplicarOk ? 'Aplicación posible (con precaución)' : 'No aplicar agroquímicos';
  }

  get aplicarMotivos(): string[] {
    const d = this.dato || {};
    const out: string[] = [];
    if (d.temp_af >= 30) out.push('Temperatura alta');
    if (d.hum_af <= 55) out.push('Humedad baja');
    if (d.rr_15 > 0) out.push('Lluvia reciente');
    if (d.viento_medio > 10) out.push('Viento fuerte');
    else if (d.viento_max > 10) out.push('Ráfagas fuertes');
    return out;
  }

  async verDetalleAplicacion() {
    const motivos =
      this.aplicarMotivos?.length ? this.aplicarMotivos.join(' · ') : 'Condiciones dentro de rangos habituales.';

    const msg =
      `<strong>${this.aplicarTexto}</strong><br><br>` +
      `Motivos: ${motivos}<br><br>` +
      `Temp: ${this.dato?.temp_af ?? '—'} °C<br>` +
      `HR: ${this.dato?.hum_af ?? '—'} %<br>` +
      `Viento: ${this.dato?.viento_medio ?? '—'} km/h (máx ${this.dato?.viento_max ?? '—'})<br>` +
      `Lluvia 15’: ${this.dato?.rr_15 ?? '—'} mm`;

    const a = await this.alertCtrl.create({
      header: 'Recomendación',
      message: msg,
      buttons: ['Cerrar'],
      cssClass: 'alert-glass',
    });
    await a.present();
  }

  async verDetalleAlerta(a: any) {
    const msg =
      `<strong>${a?.area ?? ''}</strong><br>` +
      `${a?.fecha ?? ''}<br>` +
      `<br><strong>Descripción</strong><br>${a?.descripcion ?? '—'}` +
      `<br><br><strong>Instrucciones</strong><br>${a?.instruccion ?? '—'}`;

    const al = await this.alertCtrl.create({
      header: `Nivel ${a?.nivel ?? '—'}`,
      message: msg,
      buttons: ['Cerrar'],
      cssClass: 'alert-glass',
    });
    await al.present();
  }

  // ====== HELPERS ======
  refrescar(event: any) {
    this.refreshAll().pipe(takeUntil(this.destroy$)).subscribe({
      complete: () => event?.target?.complete?.(),
      error: () => event?.target?.complete?.(),
    });
    setTimeout(() => event?.target?.complete?.(), 15000);
  }

  private safeParse(value: string | null) {
    if (!value) return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  private toNum(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // Dirección a partir de grados (0-360) -> N, NNE, NE...
  private windDirFromDeg(deg: any): string {
    const d = Number(deg);
    if (!Number.isFinite(d)) return '';
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
    const idx = Math.round(((d % 360) / 22.5)) % 16;
    return dirs[idx];
  }

  get vientoLabel(): string {
    // velocidad estación
    const v = Number(this.dato?.viento_medio);
    const vOk = Number.isFinite(v);

    // dirección: primero estación (si existe), si no OpenWeather (si lo tenés en this.msj)
    const degEst = this.dato?.viento_dir ?? this.dato?.viento_deg ?? null;
    const degOwm = this.msj?.wind?.deg ?? null;

    const dir = this.windDirFromDeg(degEst ?? degOwm);
    const speed = vOk ? `${v.toFixed(0)} km/h` : `— km/h`;

    return dir ? `${speed} · ${dir}` : speed;
  }

  get vientoDeg(): number | null {
    // prioridad: estación -> OWM
    const degEst = this.dato?.viento_dir ?? this.dato?.viento_deg ?? null;
    const degOwm = this.msj?.wind?.deg ?? null;
    const d = Number(degEst ?? degOwm);
    return Number.isFinite(d) ? d : null;
  }

  get vientoDirText(): string {
    const degEst = this.dato?.viento_dir ?? this.dato?.viento_deg ?? null;
    const degOwm = this.msj?.wind?.deg ?? null;
    return this.windDirFromDeg(degEst ?? degOwm);
  }

  // El ícono navigate-outline viene inclinado: corregimos con offset.
  private readonly WIND_ICON_OFFSET_DEG = -45;

  get vientoRotationDeg(): number | null {
    const deg = this.vientoDeg; // tu getter actual (0..360)
    if (deg == null) return null;
    // normalizo 0..360 por las dudas
    const rot = (deg + this.WIND_ICON_OFFSET_DEG) % 360;
    return (rot + 360) % 360;
  }

}
