import { Router } from '@angular/router';
import { decimal } from '../shared/formato';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { CompartirService, fechaHoy } from 'src/app/services/compartir.service';
import { ChartOptions, ChartType, ChartDataSets } from 'chart.js';
import { Color, Label, BaseChartDirective } from 'ng2-charts';
import { LoadingController } from '@ionic/angular';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { AlertController } from '@ionic/angular';

@Component({
  selector: 'app-lluvias',
  templateUrl: 'lluvias.page.html',
  styleUrls: ['lluvias.page.scss']
})
export class LluviasPage implements OnInit, OnDestroy {

  public showChart = false;   // 👈 canvas se crea cuando yo quiero
  private firstLoadDone = false;
  private estacionActualId: string | null = null;
  private stationSub?: Subscription;

  campaniaDistanciaKm: number | null = null;
  campaniaMesesSinDatoTexto = '';
  dato: any;
  dia: string;
  nombreMes: string;
  anio: string;
  hora: string;
  diaSemana: string;

  mensajes: any[] = [];   // hoy (intervalos)
  mensajes2: any[] = [];  // 30 días
  mensajes3: any[] = [];  // mensual

  rrAyer = 0;
  mesesCorto = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  private auxRR: any[] = [];
  private auxD: any[] = [];

  selectedRange: '1' | '2' | '3' = '1';
  isLoading = false;

  chartTitle = 'Lluvia por intervalo (hoy)';
  chartHint = 'mm';

  resumenTitulo = 'Resumen del día';
  resumenItems: Array<{ label: string; value: string; hint?: string; tone?: string }> = [];

  anioSeleccionado = new Date().getFullYear();
  aniosDisponibles: number[] = [];

  campaniaLocalidad: any = null;
  campaniaDataset: Array<{
    year: number;
    month: string;
    monthNumber: number;
    value: number | null;
    normal: number | null;
    pending: boolean;
  }> = [];

  campaniaReferencePeriod = '';
  campaniaZone = '';

  campaniaObsTexto = 'S/D';
  campaniaNormalTexto = 'S/D';
  campaniaPorcentajeTexto = 'S/D';
  campaniaDiferenciaTexto = 'S/D';
  campaniaEstadoTexto = 'Sin datos';
  campaniaEstadoClase = 'estado--sd';
  campaniaHastaTexto = '';

  /** Una o dos líneas: lluvia del año y del mes frente a la normal de la estación hasta hoy */
  comparacionNormal: string[] = [];
  private lluviaNormal: (number | null)[] | null = null;
  private lluviaNormalEstacion: number | null = null;

  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

  public barChartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 } as any,
    scales: {
      xAxes: [{
        ticks: {
          fontColor: '#d7d7d7' as any,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 10
        },
        gridLines: { display: false }
      }],
      yAxes: [{
        ticks: {
          fontColor: '#d7d7d7' as any,
          beginAtZero: true,
          maxTicksLimit: 6
        },
        scaleLabel: { display: true, labelString: 'mm' },
        gridLines: { display: true }
      }]
    },
    legend: { display: false } as any
  };


  public barChartLabels: Label[] = [];
  public barChartType: ChartType = 'bar';
  public barChartLegend = false;

  public barChartData: ChartDataSets[] = [{ data: [], label: 'Lluvia' }];

  public barChartColors: Color[] = [{
    backgroundColor: 'rgba(128, 227, 211, 0.65)',
    borderColor: 'rgba(128, 227, 211, 1)'
  }];

  imagen: string;
  ubicacion: string;
  mapas: string;

  constructor(
    private datosLluvias: EstacionesService,
    private router: Router,
    public loadingCtrl: LoadingController,
    private alertCtrl: AlertController,
    private compartir: CompartirService
  ) {
    this.cargarDatos();
    this.cargarImagen();
  }

  ngAfterViewInit() {
    this.recrearCanvas();
  }

  /** Comparte el gráfico como imagen con la estación, la fecha y la fuente (WhatsApp, etc.) */
  compartirGrafico() {
    const canvas = this.chart?.chart?.canvas;
    if (!canvas) return;
    this.compartir.compartir({
      titulo: `${this.chartTitle} · ${this.chartHint}`,
      subtitulo: [this.dato?.nombre, fechaHoy()].filter(Boolean).join(' · '),
      imagen: canvas,
      notas: this.selectedRange === '3' ? ['Barras: lluvia de cada mes · Línea: lluvia normal', ...this.comparacionNormal] : [],
      nombre: 'lluvia',
    });
  }

  ionViewDidEnter() {
    this.recrearCanvas();
  }

  ngOnInit() {
    this.inicializarAniosDisponibles();

    this.estacionActualId = localStorage.getItem('estacion');

    this.cargarDatos();
    this.cargarImagen();
    this.traerRRMes();
    this.firstLoadDone = true;

    this.stationSub = this.datosLluvias.stationChanged$.subscribe(estacion => {
      if (!estacion) return;

      const cambioLocalidad =
        this.estacionActualId !== null &&
        this.estacionActualId !== estacion;

      this.estacionActualId = estacion;

      if (!cambioLocalidad && this.firstLoadDone) {
        return;
      }

      this.resetAnioCampaniaAlActual();

      this.cargarDatos();
      this.cargarImagen();

      // También con «Año»: las series de la estación nueva hacen falta para el resumen y la normal
      this.traerRRMes();
    });
  }

  ngOnDestroy() {
    this.stationSub?.unsubscribe();
  }

  private inicializarAniosDisponibles() {
    const actual = new Date().getFullYear();
    this.aniosDisponibles = [];

    for (let y = actual; y >= 2012; y--) {
      this.aniosDisponibles.push(y);
    }

    this.anioSeleccionado = actual;
  }

  cargarDatos() {
    this.dato = JSON.parse(localStorage.getItem('datos') || 'null');
    if (!this.dato?.fecha_I) return;

    this.dia = this.dato.fecha_I.substr(8, 2);
    const mes = this.dato.fecha_I.substr(5, 2);
    this.anio = this.dato.fecha_I.substr(0, 4);

    const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    const dt = new Date(Date.UTC(+this.anio, +mes - 1, +this.dia)); // «MM DD, AAAA» no lo entiende Safari (iOS)
    this.diaSemana = dias[dt.getUTCDay()];
    this.nombreMes = meses[parseInt(mes, 10) - 1];

    this.hora = this.dato.fecha_I.substr(11, 5);

    this.dato.RR_dia = Number(this.dato.RR_dia);
    this.dato.rr_mes = Number(this.dato.rr_mes);
    this.dato.rr_15 = Number(this.dato.rr_15);
  }

  async traerRRMes(onDone?: () => void, showLoading = true) {
    this.auxRR = [];
    this.auxD = [];
    this.isLoading = true;

    let loading: HTMLIonLoadingElement | undefined;
    if (showLoading) {
      loading = await this.loadingCtrl.create({
        spinner: 'bubbles',
        translucent: true,
        cssClass: 'custom-class custom-loading',
        showBackdrop: false,
        message: 'Espere por favor...',
      });
      await loading.present();
    }

    const estacion = Number(localStorage.getItem('estacion') ?? 0);
    this.traerLluviaNormal(estacion);

    this.datosLluvias.getRRMes(estacion).subscribe({
      next: (posts: any[]) => {
        this.mensajes = posts?.[0] || [];
        this.mensajes2 = posts?.[1] || [];
        this.mensajes3 = posts?.[2] || [];
        this.compararConNormal();

        if (this.selectedRange === '3') {
          this.cargarCampaniaAnual();
        } else {
          const rango = this.selectedRange || '1';

          this.traerRR(rango);
          this.updateChartTexts(rango);
          this.updateResumen(rango);
        }

        // 2) recién ahora creá el canvas (recreación)
        this.recrearCanvas();
      },
      error: () => {
        this.isLoading = false;
        onDone?.();
      },
      complete: () => {
        this.isLoading = false;
        loading?.dismiss().catch(() => { });
        onDone?.();
      }
    });
  }

  refrescar(event: any) {
    const onDone = () => event?.target?.complete?.();

    this.cargarDatos();
    this.cargarImagen();

    if (this.selectedRange === '3') {
      this.cargarCampaniaAnual(onDone);
    } else {
      this.traerRRMes(onDone, false);
    }

    setTimeout(onDone, 15000);
  }

  onRangeChange(ev: any) {
    const v = String(ev?.detail?.value || '1') as '1' | '2' | '3';
    this.selectedRange = v;

    if (v === '3') {
      this.cargarCampaniaAnual();
      return;
    }

    this.traerRR(v);
    this.updateChartTexts(v);
    this.updateResumen(v);
    this.recrearCanvas();
  }

  onClickAhora() {
    this.router.navigate(['/tabs/mapa'], { queryParams: { modo: 'mapa-rr' } });
  }

  traerRR(tipoR: '1' | '2' | '3') {
    this.auxRR = [];
    this.auxD = [];

    try {
      if (this.mensajes2?.length >= 2) {
        this.rrAyer = Number(this.mensajes2[this.mensajes2.length - 2].lluvia);
      } else {
        this.rrAyer = 0;
      }
    } catch {
      this.rrAyer = 0;
    }

    // mensajes3 va desde hace un año: el mes en curso se busca por año y mes, no por posición
    const mesActual = this.totalDelMes(new Date().getFullYear(), new Date().getMonth() + 1);
    if (this.dato && mesActual != null) {
      this.dato.rr_mes = mesActual;
    }

    if (tipoR === '1') {
      for (let i = 0; i < this.mensajes.length; i++) {
        const v = Number(this.mensajes[i].lluvia);
        this.auxRR.push((v < 500 && this.mensajes[i].lluvia != null) ? Number(v.toFixed(1)) : null);
        this.auxD.push(this.mensajes[i].hora);
      }
    } else if (tipoR === '2') {
      for (let i = 0; i < this.mensajes2.length; i++) {
        const v = Number(this.mensajes2[i].lluvia);
        this.auxRR.push((v < 1000 && this.mensajes2[i].lluvia != null) ? Number(v.toFixed(1)) : null);
        this.auxD.push(this.mensajes2[i].dia.substr(8, 2) + '-' + this.mensajes2[i].dia.substr(5, 2));
      }
    } else {
      for (let i = 0; i < this.mensajes3.length; i++) {
        const v = Number(this.mensajes3[i].lluvia);
        this.auxRR.push((v < 1000 && this.mensajes3[i].lluvia != null) ? Number(v.toFixed(1)) : null);
        this.auxD.push(this.mesesCorto[parseInt(this.mensajes3[i].mes, 10) - 1]);
      }
    }

    this.barChartLegend = false;
    this.barChartColors = [{
      backgroundColor: 'rgba(128, 227, 211, 0.65)',
      borderColor: 'rgba(128, 227, 211, 1)'
    }];

    // ⚠️ claves: nuevas referencias SIEMPRE
    this.barChartData = [{ data: this.auxRR, label: 'Lluvia' }];
    this.barChartLabels = [...this.auxD];

    this.updateChartTexts(tipoR);
    this.updateResumen(tipoR);

    this.recrearCanvas();
  }

  /** Total del mes en la serie mensual de la estación; null si el mes no está (o le falta algún día) */
  private totalDelMes(anio: number, mes: number): number | null {
    const fila = (this.mensajes3 || []).find(x => Number(x?.anio) === anio && Number(x?.mes) === mes);
    const v = this.toNum(fila?.lluvia);
    return Number.isFinite(v) ? v : null;
  }

  private traerLluviaNormal(estacion: number) {
    if (this.lluviaNormalEstacion === estacion) return;

    this.lluviaNormalEstacion = estacion;
    this.lluviaNormal = null;
    this.comparacionNormal = [];

    this.datosLluvias.getLluviaNormal(estacion).subscribe(normal => {
      if (this.lluviaNormalEstacion !== estacion) return;
      this.lluviaNormal = normal;
      this.compararConNormal();
    });
  }

  /**
   * Lluvia del año y del mes en curso frente a la normal hasta hoy: los meses cerrados con su normal
   * completa y el mes en curso con la parte de la normal que corresponde a los días transcurridos.
   * Sin normales o con meses incompletos, la línea no va.
   */
  private compararConNormal() {
    this.comparacionNormal = [];
    const normal = this.lluviaNormal;
    if (!normal) return;

    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = hoy.getMonth() + 1;
    const fraccion = hoy.getDate() / new Date(anio, mes, 0).getDate();

    const delMes = this.totalDelMes(anio, mes) ?? this.toNum(this.dato?.rr_mes);
    const normalMes = normal[mes - 1];
    if (!Number.isFinite(delMes) || normalMes == null || normalMes <= 0) return;

    let obsAnio = delMes;
    let normalAnio = normalMes * fraccion;
    for (let m = 1; m < mes; m++) {
      const v = this.totalDelMes(anio, m);
      if (v == null || normal[m - 1] == null) {
        obsAnio = NaN;
        break;
      }
      obsAnio += v;
      normalAnio += normal[m - 1];
    }

    if (mes > 1 && Number.isFinite(obsAnio) && normalAnio > 0) {
      this.comparacionNormal.push(`En ${anio} llevás ${this.fmtMm(obsAnio, 0)}, ${this.frenteANormal(obsAnio, normalAnio)}.`);
    }

    // Los primeros días del mes la comparación todavía no dice nada
    if (hoy.getDate() >= 8) {
      const nombre = hoy.toLocaleDateString('es-AR', { month: 'long' });
      this.comparacionNormal.push(`En ${nombre}, ${this.fmtMm(delMes, 0)}: ${this.frenteANormal(delMes, normalMes * fraccion)}.`);
    }
  }

  private frenteANormal(obs: number, normal: number): string {
    const pct = (obs / normal - 1) * 100;
    if (Math.abs(pct) < 10) return 'cerca de lo normal a esta fecha';
    return `un ${pct.toFixed(0).replace('-', '')} % ${pct < 0 ? 'menos' : 'más'} que lo normal a esta fecha`;
  }

  cargarImagen() {
    if (!this.dato) return;

    if (this.dato.RR_dia < 0.5) this.imagen = '../../assets/fondos/inicio-soleado.jpg';
    else if (this.dato.RR_dia < 3) this.imagen = '../../assets/fondos/lluvias2.jpg';
    else if (this.dato.RR_dia < 10) this.imagen = '../../assets/fondos/lluvias1.jpg';
    else this.imagen = '../../assets/fondos/lluvias3.jpg';

    this.ubicacion = '../../assets/wheater-icons/ubicacion.png';
    this.mapas = '../../assets/tab-icons/btnMapas.png';
  }

  goLocalidades() {
    this.router.navigate(['/localidades']);
  }

  private toNum(v: any): number {
    if (v === null || v === undefined || v === '') return NaN;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  private normalizarValorCampania(v: any): number | null {
    const n = Number(v);

    if (!Number.isFinite(n)) {
      return null;
    }

    // Cubre -999.9, -99.9 u otros códigos negativos de faltante
    if (n <= -99) {
      return null;
    }

    return n;
  }

  private fmtMm(v: any, digits = 1): string {
    const n = this.toNum(v);
    if (!Number.isFinite(n)) return 'S/D';
    return `${decimal(n, digits)} mm`;
  }

  private fmtPct(v: any): string {
    const n = this.toNum(v);
    if (!Number.isFinite(n)) return 'S/D';
    return `${n.toFixed(0)} %`;
  }

  private mesNumeroDesdeTexto(mes: string): number {
    const m = String(mes || '').trim().toUpperCase();

    const map: any = {
      ENE: 1,
      FEB: 2,
      MAR: 3,
      ABR: 4,
      MAY: 5,
      JUN: 6,
      JUL: 7,
      AGO: 8,
      SEP: 9,
      OCT: 10,
      NOV: 11,
      DIC: 12,
    };

    return map[m] || 0;
  }

  private esMesPendiente(year: number, monthNumber: number): boolean {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = hoy.getMonth() + 1;

    return year > y || (year === y && monthNumber >= m);
  }

  private normalizarTexto(s: string): string {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\./g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private recrearCanvas() {
    // Apago y prendo el canvas para que Chart.js vuelva a medir el contenedor
    this.showChart = false;

    setTimeout(() => {
      this.showChart = true;

      // doble RAF = Ionic termina layout y Chart mide bien
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            this.chart?.chart?.resize();
            this.chart?.update();
          } catch { }
        });
      });

    }, 0);
  }

  get tieneDatosHoy(): boolean {
    return Array.isArray(this.mensajes) && this.mensajes.some(x => {
      const v = this.toNum(x?.lluvia);
      return Number.isFinite(v);
    });
  }

  get tieneLluviaHoy(): boolean {
    return Array.isArray(this.mensajes) && this.mensajes.some(x => {
      const v = this.toNum(x?.lluvia);
      return Number.isFinite(v) && v > 0;
    });
  }

  get tieneDatos30Dias(): boolean {
    return Array.isArray(this.mensajes2) && this.mensajes2.some(x => {
      const v = this.toNum(x?.lluvia);
      return Number.isFinite(v);
    });
  }

  get tieneDatosAnio(): boolean {
    if (this.campaniaDataset?.length) {
      return this.campaniaDataset.some(x => x.value !== null || x.normal !== null);
    }

    return Array.isArray(this.mensajes3) && this.mensajes3.some(x => {
      const v = this.toNum(x?.lluvia);
      return Number.isFinite(v);
    });
  }

  get tieneDatosRangoActual(): boolean {
    if (this.selectedRange === '1') return this.tieneDatosHoy;
    if (this.selectedRange === '2') return this.tieneDatos30Dias;
    return this.tieneDatosAnio;
  }

  get tieneLluviaRangoActual(): boolean {
    if (this.selectedRange === '1') return this.tieneLluviaHoy;

    if (this.selectedRange === '2') {
      return this.mensajes2.some(x => {
        const v = this.toNum(x?.lluvia);
        return Number.isFinite(v) && v > 0;
      });
    }

    if (this.campaniaDataset?.length) {
      return this.campaniaDataset.some(x => x.value !== null && x.value > 0);
    }

    return this.mensajes3.some(x => {
      const v = this.toNum(x?.lluvia);
      return Number.isFinite(v) && v > 0;
    });
  }

  get mensajeSinDatos(): string {
    if (this.selectedRange === '1') {
      return 'No hay registros de lluvia por intervalo para hoy.';
    }

    if (this.selectedRange === '2') {
      return 'No hay datos suficientes para mostrar los últimos 30 días.';
    }

    return 'No hay datos de campaña para la localidad seleccionada.';
  }

  get mensajeSinLluvia(): string {
    if (this.selectedRange === '1') {
      return 'Sin lluvia registrada hoy.';
    }

    if (this.selectedRange === '2') {
      return 'No se registraron lluvias en los últimos 30 días.';
    }

    return 'No se registraron lluvias en los meses cerrados del año seleccionado.';
  }

  private cargarCampaniaAnual(onDone?: () => void) {
    this.isLoading = true;

    this.datosLluvias.getDatosCampaniaLluvia(1, this.anioSeleccionado).subscribe({
      next: (resp: any) => {
        const rows = Array.isArray(resp?.data) ? resp.data : [];
        const localidad = this.buscarLocalidadCampania(rows);

        this.campaniaLocalidad = localidad;
        this.campaniaReferencePeriod = localidad?.reference_period || '';
        this.campaniaZone = localidad?.zone || '';

        this.campaniaDataset = this.normalizarCampaniaDataset(localidad);

        this.armarGraficoCampania();
        this.updateResumenCampania();
        this.recrearCanvas();
      },
      error: () => {
        this.campaniaLocalidad = null;
        this.campaniaDataset = [];
        this.armarGraficoCampania();
        this.updateResumenCampania();
        onDone?.();
      },
      complete: () => {
        this.isLoading = false;
        onDone?.();
      }
    });
  }

  private buscarLocalidadCampania(rows: any[]): any {
    if (!rows?.length) return null;

    const nombreEstacion = this.normalizarTexto(this.dato?.nombre || '');

    const latEstacion = this.toNum(
      this.dato?.lat ??
      this.dato?.Lat ??
      this.dato?.latitud ??
      this.dato?.Latitud
    );

    const lonEstacion = this.toNum(
      this.dato?.lon ??
      this.dato?.Lon ??
      this.dato?.longitud ??
      this.dato?.Longitud
    );

    // Si no tenemos coordenadas, recién ahí intentamos por nombre.
    if (!Number.isFinite(latEstacion) || !Number.isFinite(lonEstacion)) {
      const exacta = rows.find(r =>
        this.normalizarTexto(r?.name) === nombreEstacion
      );

      if (exacta) return exacta;

      const parcial = rows.find(r => {
        const rn = this.normalizarTexto(r?.name);
        return rn && nombreEstacion && (
          rn.includes(nombreEstacion) ||
          nombreEstacion.includes(rn)
        );
      });

      return parcial || null;
    }

    // Con coordenadas, buscamos la estación pluviométrica más cercana.
    const cercana = this.buscarMasCercanaPorCoordenadas(
      rows,
      latEstacion,
      lonEstacion
    );

    const distancia = this.distanciaKm(
      latEstacion,
      lonEstacion,
      this.toNum(cercana?.lat),
      this.toNum(cercana?.lon)
    );

    // Guardamos la distancia para mostrarla en pantalla.
    this.campaniaDistanciaKm = Number.isFinite(distancia) ? distancia : null;

    // Umbral máximo automático.
    // Podemos cambiar 20 km por 15 km si querés ser más estricto.
    if (Number.isFinite(distancia) && distancia <= 20) {
      return cercana;
    }

    return null;
  }

  private normalizarCampaniaDataset(localidad: any): Array<{
    year: number;
    month: string;
    monthNumber: number;
    value: number | null;
    normal: number | null;
    pending: boolean;
  }> {
    const ds = Array.isArray(localidad?.dataset) ? localidad.dataset : [];

    return ds.map((x: any) => {
      const year = Number(x?.year);
      const month = String(x?.month || '');
      const monthNumber = this.mesNumeroDesdeTexto(month);

      return {
        year,
        month,
        monthNumber,
        value: this.normalizarValorCampania(x?.value),
        normal: this.normalizarValorCampania(x?.normal),
        pending: this.esMesPendiente(year, monthNumber),
      };
    });
  }

  private armarGraficoCampania() {
    this.chartTitle = `Lluvia mensual vs normal · ${this.anioSeleccionado}`;
    this.chartHint = 'mm';

    if (!this.campaniaDataset?.length) {
      this.barChartLabels = [];
      this.barChartData = [{ data: [], label: 'Lluvia' }];
      return;
    }

    const mesesSinDato = this.campaniaDataset
      .filter(x => x.value === null && !x.pending)
      .map(x => x.month);

    this.campaniaMesesSinDatoTexto = mesesSinDato.length
      ? `Meses sin dato: ${mesesSinDato.join(', ')}`
      : '';

    this.barChartLabels = this.campaniaDataset.map(x => {
      if (x.value === null && !x.pending) {
        return [x.month, 'S/D'];
      }

      if (x.pending) {
        return [x.month, 'pend.'];
      }

      return x.month;
    });

    const observado = this.campaniaDataset.map(x =>
      x.value !== null ? Number(x.value.toFixed(1)) : null
    );

    const normal = this.campaniaDataset.map(x =>
      x.normal !== null ? Number(x.normal.toFixed(1)) : null
    );

    this.barChartData = [
      {
        data: observado,
        label: 'Observado',
        type: 'bar',
      } as any,
      {
        data: normal,
        label: 'Normal',
        type: 'line',
        fill: false,
        lineTension: 0.25,
        pointRadius: 3,
        borderWidth: 2,
      } as any,
    ];

    this.barChartLegend = true;

    this.barChartColors = [
      {
        backgroundColor: 'rgba(128, 227, 211, 0.65)',
        borderColor: 'rgba(128, 227, 211, 1)'
      },
      {
        backgroundColor: 'rgba(255, 176, 32, 0.10)',
        borderColor: 'rgba(255, 176, 32, 0.95)',
        pointBackgroundColor: 'rgba(255, 176, 32, 0.95)',
        pointBorderColor: 'rgba(255, 176, 32, 0.95)'
      } as any
    ];
  }

  private updateResumenCampania() {
    this.resumenTitulo = `Resumen ${this.anioSeleccionado}`;

    if (!this.campaniaDataset?.length || !this.campaniaLocalidad) {
      this.campaniaObsTexto = 'S/D';
      this.campaniaNormalTexto = 'S/D';
      this.campaniaPorcentajeTexto = 'S/D';
      this.campaniaDiferenciaTexto = 'S/D';
      this.campaniaEstadoTexto = 'Sin datos';
      this.campaniaEstadoClase = 'estado--sd';
      this.campaniaHastaTexto = '';

      this.resumenItems = [];
      return;
    }

    const validos = this.campaniaDataset.filter(x =>
      x.value !== null &&
      x.normal !== null &&
      !x.pending
    );

    const obs = validos.reduce((acc, x) => acc + (x.value || 0), 0);
    const normal = validos.reduce((acc, x) => acc + (x.normal || 0), 0);
    const diff = obs - normal;
    const pct = normal > 0 ? (obs / normal) * 100 : NaN;

    const ultimo = validos.length ? validos[validos.length - 1] : null;

    this.campaniaObsTexto = this.fmtMm(obs);
    this.campaniaNormalTexto = this.fmtMm(normal);
    this.campaniaPorcentajeTexto = this.fmtPct(pct);
    this.campaniaDiferenciaTexto = `${diff >= 0 ? '+' : ''}${decimal(diff, 1)} mm`;
    this.campaniaHastaTexto = ultimo ? `datos cerrados hasta ${ultimo.month}` : '';

    const estado = this.clasificarPorcentajeNormal(pct);
    this.campaniaEstadoTexto = estado.texto;
    this.campaniaEstadoClase = estado.clase;

    const conValor = this.campaniaDataset.filter(x => x.value !== null);
    const mesMasLluvioso = conValor.length
      ? conValor.reduce((acc, x) => (x.value || 0) > (acc.value || 0) ? x : acc, conValor[0])
      : null;

    const conPct = this.campaniaDataset
      .filter(x => x.value !== null && x.normal !== null && x.normal > 0)
      .map(x => ({
        ...x,
        pct: ((x.value || 0) / (x.normal || 1)) * 100
      }));

    const mayorExceso = conPct.length
      ? conPct.reduce((acc, x) => x.pct > acc.pct ? x : acc, conPct[0])
      : null;

    const mayorDeficit = conPct.length
      ? conPct.reduce((acc, x) => x.pct < acc.pct ? x : acc, conPct[0])
      : null;

    this.resumenItems = [
      {
        label: 'Observado',
        value: this.campaniaObsTexto,
        hint: this.campaniaHastaTexto || 'meses válidos',
        tone: 'rain',
      },
      {
        label: 'Normal comparable',
        value: this.campaniaNormalTexto,
        hint: this.campaniaReferencePeriod ? `Ref. ${this.campaniaReferencePeriod}` : '',
      },
      {
        label: '% normal',
        value: this.campaniaPorcentajeTexto,
        hint: this.campaniaEstadoTexto,
        tone: this.campaniaEstadoClase,
      },
      {
        label: 'Diferencia',
        value: this.campaniaDiferenciaTexto,
        hint: 'observado - normal',
        tone: diff >= 0 ? 'rain' : 'warn',
      },
      {
        label: 'Mes más lluvioso',
        value: mesMasLluvioso ? this.fmtMm(mesMasLluvioso.value) : 'S/D',
        hint: mesMasLluvioso?.month || '',
        tone: 'rain',
      },
      {
        label: 'Mayor exceso',
        value: mayorExceso ? this.fmtPct(mayorExceso.pct) : 'S/D',
        hint: mayorExceso?.month || '',
        tone: 'rain',
      },
      {
        label: 'Mayor déficit',
        value: mayorDeficit ? this.fmtPct(mayorDeficit.pct) : 'S/D',
        hint: mayorDeficit?.month || '',
        tone: 'warn',
      },
      {
        label: 'Zona',
        value: this.campaniaZone || 'S/D',
        hint: this.campaniaLocalidad?.name || '',
      },
      {
        label: 'Serie usada',
        value: this.campaniaLocalidad?.name || 'S/D',
        hint: this.campaniaDistanciaKm != null
          ? `${decimal(this.campaniaDistanciaKm, 1)} km de la estación automática`
          : 'sin distancia calculada',
      },
      {
        label: 'Referencia',
        value: this.campaniaReferencePeriod || 'S/D',
        hint: this.campaniaZone ? `Zona ${this.campaniaZone}` : '',
      },
    ];
  }

  private clasificarPorcentajeNormal(pct: number): { texto: string; clase: string } {
    if (!Number.isFinite(pct)) {
      return { texto: 'Sin datos', clase: 'estado--sd' };
    }

    if (pct < 50) {
      return { texto: 'Muy deficitario', clase: 'estado--deficit' };
    }

    if (pct < 80) {
      return { texto: 'Deficitario', clase: 'estado--deficit' };
    }

    if (pct <= 120) {
      return { texto: 'Normal', clase: 'estado--normal' };
    }

    if (pct <= 160) {
      return { texto: 'Superior a lo normal', clase: 'estado--rain' };
    }

    return { texto: 'Muy superior', clase: 'estado--rain' };
  }

  private updateChartTexts(tipoR: '1' | '2' | '3') {
    if (tipoR === '1') {
      this.chartTitle = 'Lluvia por intervalo (hoy)';
      this.chartHint = 'mm';
      return;
    }

    if (tipoR === '2') {
      this.chartTitle = 'Lluvia diaria (últimos 30 días)';
      this.chartHint = 'mm/día';
      return;
    }

    this.chartTitle = `Lluvia mensual vs normal · ${this.anioSeleccionado}`;
    this.chartHint = 'mm/mes';
  }

  private updateResumen(tipoR: '1' | '2' | '3') {
    if (tipoR === '1') {
      this.updateResumenHoy();
      return;
    }

    if (tipoR === '2') {
      this.updateResumen30Dias();
      return;
    }

    this.updateResumenCampania();
  }

  private updateResumenHoy() {
    this.resumenTitulo = 'Resumen del día';

    const rows = (this.mensajes || [])
      .map(x => ({ hora: x?.hora || '', lluvia: this.toNum(x?.lluvia) }))
      .filter(x => Number.isFinite(x.lluvia));

    if (!rows.length) {
      this.resumenItems = [];
      return;
    }

    const total = this.toNum(this.dato?.RR_dia);
    const conLluvia = rows.filter(r => r.lluvia > 0);
    const max = rows.reduce((acc, r) => r.lluvia > acc.lluvia ? r : acc, rows[0]);

    this.resumenItems = [
      { label: 'Acumulado hoy', value: this.fmtMm(total), hint: 'registro diario', tone: total > 0 ? 'rain' : '' },
      { label: 'Máx. intervalo', value: this.fmtMm(max.lluvia), hint: max.hora || '', tone: max.lluvia > 0 ? 'rain' : '' },
      { label: 'Intervalos con lluvia', value: `${conLluvia.length}`, hint: 'registros > 0 mm', tone: conLluvia.length ? 'rain' : '' },
      { label: 'Última lluvia', value: conLluvia.length ? conLluvia[conLluvia.length - 1].hora : 'Sin lluvia', hint: 'hoy' },
    ];
  }

  private updateResumen30Dias() {
    this.resumenTitulo = 'Resumen últimos 30 días';

    const rows = (this.mensajes2 || [])
      .map(x => ({ dia: x?.dia || '', lluvia: this.toNum(x?.lluvia) }))
      .filter(x => Number.isFinite(x.lluvia));

    if (!rows.length) {
      this.resumenItems = [];
      return;
    }

    const total = rows.reduce((acc, r) => acc + r.lluvia, 0);
    const conLluvia = rows.filter(r => r.lluvia > 0);
    const max = rows.reduce((acc, r) => r.lluvia > acc.lluvia ? r : acc, rows[0]);

    this.resumenItems = [
      { label: 'Total 30 días', value: this.fmtMm(total), hint: 'acumulado', tone: total > 0 ? 'rain' : '' },
      { label: 'Días con lluvia', value: `${conLluvia.length}`, hint: 'días > 0 mm', tone: conLluvia.length ? 'rain' : '' },
      { label: 'Máximo diario', value: this.fmtMm(max.lluvia), hint: max.dia ? `${max.dia.substr(8, 2)}/${max.dia.substr(5, 2)}` : '', tone: max.lluvia > 0 ? 'rain' : '' },
      { label: 'Promedio diario', value: this.fmtMm(total / rows.length), hint: `${rows.length} días disponibles` },
    ];
  }

  private buscarMasCercanaPorCoordenadas(rows: any[], lat: number, lon: number): any {
    if (!rows?.length) return null;

    let mejor = null;
    let mejorDistancia = Number.POSITIVE_INFINITY;

    for (const r of rows) {
      const rLat = this.toNum(r?.lat);
      const rLon = this.toNum(r?.lon);

      if (!Number.isFinite(rLat) || !Number.isFinite(rLon)) {
        continue;
      }

      const d = this.distanciaKm(lat, lon, rLat, rLon);

      if (d < mejorDistancia) {
        mejorDistancia = d;
        mejor = r;
      }
    }

    return mejor;
  }

  private distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    if (
      !Number.isFinite(lat1) ||
      !Number.isFinite(lon1) ||
      !Number.isFinite(lat2) ||
      !Number.isFinite(lon2)
    ) {
      return NaN;
    }

    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
      Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private toRad(v: number): number {
    return v * Math.PI / 180;
  }

  private resetAnioCampaniaAlActual() {
    const actual = new Date().getFullYear();

    this.anioSeleccionado = actual;
    this.campaniaLocalidad = null;
    this.campaniaDataset = [];
    this.campaniaReferencePeriod = '';
    this.campaniaZone = '';
    this.campaniaDistanciaKm = null;
    this.campaniaMesesSinDatoTexto = '';

    this.campaniaObsTexto = 'S/D';
    this.campaniaNormalTexto = 'S/D';
    this.campaniaPorcentajeTexto = 'S/D';
    this.campaniaDiferenciaTexto = 'S/D';
    this.campaniaEstadoTexto = 'Sin datos';
    this.campaniaEstadoClase = 'estado--sd';
    this.campaniaHastaTexto = '';
  }

  async abrirSelectorAnio(ev?: Event) {
    const target = ev?.currentTarget as HTMLElement | null;

    // Evita warning aria-hidden: el foco no debe quedar en el botón
    // mientras Ionic abre el overlay.
    if (target && typeof target.blur === 'function') {
      target.blur();
    }

    // Refuerzo para navegadores que mantienen el foco unos milisegundos.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const inputs = this.aniosDisponibles.map(y => ({
      type: 'radio' as const,
      label: String(y),
      value: y,
      checked: y === this.anioSeleccionado,
    }));

    const alert = await this.alertCtrl.create({
      header: 'Seleccionar año',
      inputs,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Aceptar',
          handler: (value: number) => {
            if (!value || Number(value) === this.anioSeleccionado) {
              return;
            }

            this.anioSeleccionado = Number(value);
            this.cargarCampaniaAnual();
          },
        },
      ],
      cssClass: 'alert-glass',
    });

    await alert.present();

    alert.onDidDismiss().then(() => {
      // Evita que el foco vuelva a quedar atrapado en un elemento oculto.
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
  }
}
