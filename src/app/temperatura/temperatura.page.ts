import { Component, OnDestroy, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { Subject, of } from 'rxjs';
import { catchError, takeUntil, timeout } from 'rxjs/operators';

@Component({
  selector: 'app-temperatura',
  templateUrl: './temperatura.page.html',
  styleUrls: ['./temperatura.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemperaturaPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // UI
  estacionNombre = '';
  diaSemana = '';
  fechaTexto = '';
  horaTexto = '';

  tActualTexto = 'S/D';
  tMinTexto = 'S/D';
  tMaxTexto = 'S/D';
  tMinHoraTexto = '';
  tMaxHoraTexto = '';
  amplitudTexto = 'S/D';

  tendenciaTexto = 'Sin tendencia';
  tendenciaClase = 'trend--flat';
  tendenciaIcono = 'remove-outline';

  resumenTitulo = 'Resumen';
  resumenItems: Array<{ label: string; value: string; hint?: string; tone?: string }> = [];

  range: 'day' | 'days30' | 'year' = 'day';
  chartReady = false;

  chartTitle = 'Pronóstico / Observación';
  chartHint = 'Serie';

  // DATA cruda
  private serieDia: Array<{ hora: string; temperatura: string }> = [];
  private serie30: Array<{ fecha: string; t_max: string; t_min: string }> = [];
  private serieMes: Array<{ mes: string; t_max: string; t_min: string }> = [];

  // CHARTJS (ng2-charts)
  lineChartData: any[] = [{ data: [], label: 'Temperatura' }];
  lineChartLabels: string[] = [];
  lineChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 200 },
    elements: {
      point: { radius: 2, hitRadius: 10, hoverRadius: 4 },
      line: { tension: 0.25, borderWidth: 2 },
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true },
    },
    scales: {
      x: {
        ticks: { maxTicksLimit: 8 },
        grid: { display: true },
      },
      y: {
        ticks: { maxTicksLimit: 6 },
        grid: { display: true },
      },
    },
  };
  lineChartColors: any[] = [
    {
      borderColor: 'rgba(128,227,211,1)',
      backgroundColor: 'rgba(128,227,211,0.15)',
      pointBackgroundColor: 'rgba(128,227,211,1)',
      pointBorderColor: 'rgba(128,227,211,1)',
    },
  ];
  lineChartLegend = false;
  lineChartType = 'line';
  lineChartPlugins: any[] = [];

  constructor(
    private estacionesService: EstacionesService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.load();
    // si tu servicio emite cambios de estación, recargamos acá
    this.estacionesService.stationChanged$
      ?.pipe(takeUntil(this.destroy$))
      .subscribe(() => this.load());
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ionViewDidEnter() {
    // por si cambian localStorage desde otra pantalla
    this.load();
  }

  private load() {
    const estacion = localStorage.getItem('estacion');
    const datosRaw = localStorage.getItem('datos');
    const datos = this.safeParse(datosRaw) || {};

    this.estacionNombre = datos?.nombre || '';
    this.setHeaderDateFromDatos(datos);

    if (!estacion || estacion === '0') {
      this.chartReady = false;
      this.cdr.markForCheck();
      return;
    }

    this.chartReady = false;
    this.cdr.markForCheck();

    this.estacionesService.getTemperatura24(estacion)
      .pipe(
        timeout(15000),
        catchError((e) => {
          console.log('[TEMP] ERROR getTemperatura24:', e);
          return of(null);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((res: any) => {
        if (!Array.isArray(res) || !Array.isArray(res[0])) {
          this.chartReady = true; // para que deje de spinear aunque venga vacío
          this.applyEmptyChart('Sin datos');
          this.cdr.markForCheck();
          return;
        }

        // Formato: [[serieDia],[serie30],[serieMes]]
        this.serieDia = Array.isArray(res[0]) ? res[0] : [];
        this.serie30 = Array.isArray(res[1]) ? res[1] : [];
        this.serieMes = Array.isArray(res[2]) ? res[2] : [];

        this.updateSummaryFromDaySeries();
        this.buildChart(this.range);
        this.updateResumen(this.range);

        this.chartReady = true;
        this.cdr.markForCheck();
      });
  }

  onRangeChange(ev: any) {
    const v = ev?.detail?.value;
    this.range = (v === 'days30' || v === 'year' || v === 'day') ? v : 'day';
    this.buildChart(this.range);
    this.updateResumen(this.range);
    this.cdr.markForCheck();
  }

  private buildChart(range: 'day' | 'days30' | 'year') {
    if (range === 'day') {
      this.chartTitle = 'Hoy';
      this.chartHint = 'Cada 15–60 min (según disponibilidad)';

      const labels = this.serieDia.map(x => x.hora);
      const data = this.serieDia.map(x => this.toNum(x.temperatura)).filter(v => Number.isFinite(v));

      if (!labels.length || !data.length) return this.applyEmptyChart('Sin datos de hoy');

      this.lineChartLabels = labels;
      this.lineChartData = [{ data, label: 'Temperatura (°C)' }];
      return;
    }

    if (range === 'days30') {
      this.chartTitle = 'Últimos 30 días';
      this.chartHint = 'Mínima y máxima diarias';

      const labels = this.serie30.map(x => this.formatShortDate(x.fecha));
      const tmin = this.serie30.map(x => this.toNum(x.t_min));
      const tmax = this.serie30.map(x => this.toNum(x.t_max));

      if (!labels.length) return this.applyEmptyChart('Sin datos 30 días');

      this.lineChartLabels = labels;
      this.lineChartData = [
        { data: tmin, label: 'T mín (°C)' },
        { data: tmax, label: 'T máx (°C)' },
      ];
      return;
    }

    // year
    this.chartTitle = 'Promedio mensual (año)';
    this.chartHint = 'T mín / T máx medias';

    const labels = this.serieMes.map(x => this.mesNombre(x.mes));
    const tmin = this.serieMes.map(x => this.toNum(x.t_min));
    const tmax = this.serieMes.map(x => this.toNum(x.t_max));

    if (!labels.length) return this.applyEmptyChart('Sin datos anuales');

    this.lineChartLabels = labels;
    this.lineChartData = [
      { data: tmin, label: 'T mín (°C)' },
      { data: tmax, label: 'T máx (°C)' },
    ];
  }

  private updateSummaryFromDaySeries() {
    const puntos = this.serieDia
      .map(x => ({
        hora: x.hora,
        temp: this.toNum(x.temperatura),
      }))
      .filter(x => Number.isFinite(x.temp));

    if (!puntos.length) {
      this.tActualTexto = 'S/D';
      this.tMinTexto = 'S/D';
      this.tMaxTexto = 'S/D';
      this.tMinHoraTexto = '';
      this.tMaxHoraTexto = '';
      this.amplitudTexto = 'S/D';
      this.tendenciaTexto = 'Sin tendencia';
      this.tendenciaClase = 'trend--flat';
      this.tendenciaIcono = 'remove-outline';
      return;
    }

    const ultimo = puntos[puntos.length - 1];
    const minP = puntos.reduce((acc, p) => p.temp < acc.temp ? p : acc, puntos[0]);
    const maxP = puntos.reduce((acc, p) => p.temp > acc.temp ? p : acc, puntos[0]);

    const amplitud = maxP.temp - minP.temp;

    this.tActualTexto = `${ultimo.temp.toFixed(1)}°`;
    this.tMinTexto = `${minP.temp.toFixed(1)}°`;
    this.tMaxTexto = `${maxP.temp.toFixed(1)}°`;

    this.tMinHoraTexto = minP.hora || '';
    this.tMaxHoraTexto = maxP.hora || '';
    this.amplitudTexto = `${amplitud.toFixed(1)}°`;

    this.updateTendencia(puntos);
  }

  private updateTendencia(puntos: Array<{ hora: string; temp: number }>) {
    if (!puntos || puntos.length < 2) {
      this.tendenciaTexto = 'Sin tendencia';
      this.tendenciaClase = 'trend--flat';
      this.tendenciaIcono = 'remove-outline';
      return;
    }

    const ultimo = puntos[puntos.length - 1];

    /*
      Tomamos una referencia de aproximadamente una hora atrás.
      Si no hay suficientes puntos, usamos el primero disponible de los últimos registros.
    */
    const refIndex = Math.max(0, puntos.length - 5);
    const ref = puntos[refIndex];

    const delta = ultimo.temp - ref.temp;

    if (Math.abs(delta) < 0.4) {
      this.tendenciaTexto = 'Estable';
      this.tendenciaClase = 'trend--flat';
      this.tendenciaIcono = 'remove-outline';
      return;
    }

    if (delta > 0) {
      this.tendenciaTexto = `Subiendo +${delta.toFixed(1)}°`;
      this.tendenciaClase = 'trend--up';
      this.tendenciaIcono = 'trending-up-outline';
      return;
    }

    this.tendenciaTexto = `Bajando ${delta.toFixed(1)}°`;
    this.tendenciaClase = 'trend--down';
    this.tendenciaIcono = 'trending-down-outline';
  }

  private updateResumen(range: 'day' | 'days30' | 'year') {
    if (range === 'day') {
      this.updateResumenDia();
      return;
    }

    if (range === 'days30') {
      this.updateResumen30Dias();
      return;
    }

    this.updateResumenAnio();
  }

  private updateResumenDia() {
    this.resumenTitulo = 'Resumen del día';

    this.resumenItems = [
      {
        label: 'Mínima',
        value: this.tMinTexto,
        hint: this.tMinHoraTexto ? `a las ${this.tMinHoraTexto}` : '',
        tone: this.toNum(this.tMinTexto.replace('°', '')) <= 3 ? 'cold' : '',
      },
      {
        label: 'Máxima',
        value: this.tMaxTexto,
        hint: this.tMaxHoraTexto ? `a las ${this.tMaxHoraTexto}` : '',
        tone: this.toNum(this.tMaxTexto.replace('°', '')) >= 30 ? 'hot' : '',
      },
      {
        label: 'Amplitud',
        value: this.amplitudTexto,
        hint: 'diferencia diaria',
        tone: this.toNum(this.amplitudTexto.replace('°', '')) >= 15 ? 'warn' : '',
      },
      {
        label: 'Tendencia',
        value: this.tendenciaTexto,
        hint: 'últimos registros',
        tone: this.tendenciaClase === 'trend--up'
          ? 'hot'
          : this.tendenciaClase === 'trend--down'
            ? 'cold'
            : '',
      },
    ];
  }

  private updateResumen30Dias() {
    this.resumenTitulo = 'Resumen últimos 30 días';

    const rows = this.serie30
      .map(x => ({
        fecha: x.fecha,
        tmin: this.toNum(x.t_min),
        tmax: this.toNum(x.t_max),
      }))
      .filter(x => Number.isFinite(x.tmin) || Number.isFinite(x.tmax));

    if (!rows.length) {
      this.resumenItems = [
        { label: 'Datos', value: 'S/D', hint: 'sin información disponible' },
      ];
      return;
    }

    const tmins = rows.map(x => x.tmin).filter(v => Number.isFinite(v));
    const tmaxs = rows.map(x => x.tmax).filter(v => Number.isFinite(v));

    const minAbs = tmins.length ? Math.min(...tmins) : NaN;
    const maxAbs = tmaxs.length ? Math.max(...tmaxs) : NaN;

    const diasHelada = rows.filter(x => Number.isFinite(x.tmin) && x.tmin <= 0).length;
    const diasCalidos = rows.filter(x => Number.isFinite(x.tmax) && x.tmax >= 30).length;

    const promMin = this.promedio(tmins);
    const promMax = this.promedio(tmaxs);

    this.resumenItems = [
      {
        label: 'Mínima absoluta',
        value: Number.isFinite(minAbs) ? `${minAbs.toFixed(1)}°` : 'S/D',
        hint: 'menor mínima',
        tone: Number.isFinite(minAbs) && minAbs <= 0 ? 'cold' : '',
      },
      {
        label: 'Máxima absoluta',
        value: Number.isFinite(maxAbs) ? `${maxAbs.toFixed(1)}°` : 'S/D',
        hint: 'mayor máxima',
        tone: Number.isFinite(maxAbs) && maxAbs >= 30 ? 'hot' : '',
      },
      {
        label: 'Promedio mín/máx',
        value: `${Number.isFinite(promMin) ? promMin.toFixed(1) : 'S/D'}° / ${Number.isFinite(promMax) ? promMax.toFixed(1) : 'S/D'}°`,
        hint: 'últimos 30 días',
      },
      {
        label: 'Heladas',
        value: `${diasHelada}`,
        hint: 'días con Tmin ≤ 0°C',
        tone: diasHelada > 0 ? 'cold' : '',
      },
      {
        label: 'Días cálidos',
        value: `${diasCalidos}`,
        hint: 'días con Tmax ≥ 30°C',
        tone: diasCalidos > 0 ? 'hot' : '',
      },
    ];
  }
  private updateResumenAnio() {
    this.resumenTitulo = 'Resumen anual';

    const rows = this.serieMes
      .map(x => ({
        mes: x.mes,
        tmin: this.toNum(x.t_min),
        tmax: this.toNum(x.t_max),
      }))
      .filter(x => Number.isFinite(x.tmin) || Number.isFinite(x.tmax));

    if (!rows.length) {
      this.resumenItems = [
        { label: 'Datos', value: 'S/D', hint: 'sin información disponible' },
      ];
      return;
    }

    const tmins = rows.map(x => x.tmin).filter(v => Number.isFinite(v));
    const tmaxs = rows.map(x => x.tmax).filter(v => Number.isFinite(v));

    const minMedia = tmins.length ? Math.min(...tmins) : NaN;
    const maxMedia = tmaxs.length ? Math.max(...tmaxs) : NaN;

    const promMin = this.promedio(tmins);
    const promMax = this.promedio(tmaxs);

    this.resumenItems = [
      {
        label: 'Media mín/máx',
        value: `${Number.isFinite(promMin) ? promMin.toFixed(1) : 'S/D'}° / ${Number.isFinite(promMax) ? promMax.toFixed(1) : 'S/D'}°`,
        hint: 'promedio mensual',
      },
      {
        label: 'Menor media mínima',
        value: Number.isFinite(minMedia) ? `${minMedia.toFixed(1)}°` : 'S/D',
        hint: 'entre meses disponibles',
        tone: Number.isFinite(minMedia) && minMedia <= 5 ? 'cold' : '',
      },
      {
        label: 'Mayor media máxima',
        value: Number.isFinite(maxMedia) ? `${maxMedia.toFixed(1)}°` : 'S/D',
        hint: 'entre meses disponibles',
        tone: Number.isFinite(maxMedia) && maxMedia >= 30 ? 'hot' : '',
      },
      {
        label: 'Meses cargados',
        value: `${rows.length}`,
        hint: 'con datos disponibles',
      },
    ];
  }

  private promedio(vals: number[]): number {
    const xs = vals.filter(v => Number.isFinite(v));
    if (!xs.length) return NaN;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  }

  private setHeaderDateFromDatos(datos: any) {
    // tu datos.fecha_I viene tipo "YYYY-MM-DD HH:mm:ss" (según tu Home)
    const fi: string = datos?.fecha_I || '';
    if (!fi || fi.length < 10) {
      this.diaSemana = '';
      this.fechaTexto = '';
      this.horaTexto = '';
      return;
    }

    const yyyy = fi.slice(0, 4);
    const mm = fi.slice(5, 7);
    const dd = fi.slice(8, 10);
    const hhmm = fi.length >= 16 ? fi.slice(11, 16) : '';

    const date = new Date(`${yyyy}-${mm}-${dd}T${hhmm || '00:00'}:00`);
    this.diaSemana = new Intl.DateTimeFormat('es-AR', { weekday: 'long' }).format(date).toUpperCase();
    this.fechaTexto = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
      .format(date)
      .toUpperCase();
    this.horaTexto = hhmm ? `${hhmm} HS` : '';
  }

  private applyEmptyChart(msg: string) {
    this.chartTitle = msg;
    this.chartHint = '';
    this.lineChartLabels = [];
    this.lineChartData = [{ data: [], label: '' }];
  }

  private toNum(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  private formatShortDate(iso: string): string {
    // "2026-02-06" -> "06/02"
    if (!iso || iso.length < 10) return iso;
    const d = iso.slice(8, 10);
    const m = iso.slice(5, 7);
    return `${d}/${m}`;
  }

  private mesNombre(m: any): string {
    const n = Number(m);
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    if (!Number.isFinite(n) || n < 1 || n > 12) return String(m ?? '');
    return meses[n - 1];
  }

  private safeParse(value: string | null) {
    if (!value) return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  // Acciones (ajustá URLs si tus rutas son otras)
  goLocalidades() {
    this.router.navigate(['/localidades']);
  }

  openMapaAhora() {
    // poné tu URL real
    this.router.navigate(['tabs/mapat']);
  }

  openMapaHoy() {
    // poné tu URL real
    this.router.navigate(['tabs/mapathoy']);
  }

  get tieneDatosHoy(): boolean {
    return Array.isArray(this.serieDia) && this.serieDia.some(x => {
      const v = this.toNum(x?.temperatura);
      return Number.isFinite(v);
    });
  }

  get tieneDatos30Dias(): boolean {
    return Array.isArray(this.serie30) && this.serie30.some(x => {
      const tmin = this.toNum(x?.t_min);
      const tmax = this.toNum(x?.t_max);
      return Number.isFinite(tmin) || Number.isFinite(tmax);
    });
  }

  get tieneDatosAnio(): boolean {
    return Array.isArray(this.serieMes) && this.serieMes.some(x => {
      const tmin = this.toNum(x?.t_min);
      const tmax = this.toNum(x?.t_max);
      return Number.isFinite(tmin) || Number.isFinite(tmax);
    });
  }

  get tieneDatosRangoActual(): boolean {
    if (this.range === 'day') return this.tieneDatosHoy;
    if (this.range === 'days30') return this.tieneDatos30Dias;
    return this.tieneDatosAnio;
  }

  get mensajeSinDatos(): string {
    if (this.range === 'day') {
      return 'La estación no informó registros de temperatura para hoy.';
    }

    if (this.range === 'days30') {
      return 'No hay datos suficientes para mostrar los últimos 30 días.';
    }

    return 'No hay datos suficientes para mostrar el resumen anual.';
  }

}
