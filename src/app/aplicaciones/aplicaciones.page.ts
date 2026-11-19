import { Component, OnInit } from '@angular/core';
import { decimal } from '../shared/formato';
import { LoadingController, ToastController, ModalController } from '@ionic/angular';
import { EstacionesService } from '../services/estaciones.service';
import {
  SprayAdvisorService, MetodoAplicacion, Prioridad, Cultivo, EvaluacionAplicacion, RegistroMeteo, salidaPuestaSol
} from '../services/spray-advisor.service';
import { KpService } from '../services/kp.service';
import { InfoModalComponent } from './info-modal.component';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Router } from '@angular/router';
import { CuadernoService } from '../services/cuaderno.service';

type MetodoApp = 'terrestre' | 'aerea' | 'drone';

/**
 * OpenWeatherMap da el viento a 10 m; los anemómetros de la red están a 3 m. Se lleva a 3 m (÷ 1,35,
 * como la página web) para compararlo con los mismos umbrales que los registros de la estación.
 */
const VIENTO_10M_A_3M = 1 / 1.35;

/** Un registro de la estación con más de una hora ya no es «ahora»: se usa la estimación */
const MINUTOS_REGISTRO_VIGENTE = 60;

/** Valores de «Ahora»: de la estación o, si falta o está atrasado, estimados con OpenWeatherMap */
interface ValoresAhora {
  tC: number | null;
  rh: number | null;
  medioKmh: number | null;
  rafagaKmh: number | null;
  deg: number | null;
  estimado: { temp: boolean; hum: boolean; viento: boolean };
}

// ✅ Extras de aplicación (simples, sin complicar UX)
type TipoProducto = 'HERBICIDA' | 'FUNGICIDA' | 'INSECTICIDA';
type TamGota = 'MUY_FINA' | 'FINA' | 'MEDIA' | 'GRUESA' | 'MUY_GRUESA';

/** Nombre corto del método, para el selector cerrado y el resumen de la configuración */
const METODOS_CORTOS: Record<string, string> = {
  MANUAL: 'Manual', MOSQUITO: 'Mosquito', AIRBLAST: 'Airblast', DRON: 'Dron', AVION: 'Avión',
};

@Component({
  selector: 'app-aplicaciones',
  templateUrl: './aplicaciones.page.html',
  styleUrls: ['./aplicaciones.page.scss'],
})
export class AplicacionesPage implements OnInit {

  mode: MetodoApp = 'terrestre';

  // ✅ Defaults pedidos
  tipoProducto: TipoProducto = 'HERBICIDA';
  tamGota: TamGota = 'MEDIA';

  // para que el “default por método” no pise si el usuario tocó manualmente
  private tamGotaTouched = false;

  imagen = '../../assets/fondos/eventos.jpg';

  // selección del usuario
  metodo: MetodoAplicacion = 'MOSQUITO';
  cultivo: Cultivo = 'CAÑA';
  prioridad: Prioridad = 'EQUILIBRADO';

  // “extras”
  kpIndex: number = 1;
  kpTimeTag: string | null = null;
  kpLoading = false;
  sats = 12;

  // ubicación
  lat: number | null = null;
  lon: number | null = null;
  usandoGps = false;
  origenUbicacion: 'ESTACION' | 'GPS' = 'ESTACION';
  estacionNombre: string | null = null;
  lugarNombre: string | null = null;

  // datos
  climaActual: any = null;
  /** Último registro de la estación elegida (estaciones.php, depurado) */
  datoEstacion: any = null;
  ahora: ValoresAhora | null = null;
  pronostico: any[] = [];
  gpsNombre: string | null = null;

  evalActual: EvaluacionAplicacion | null = null;
  evalPronostico: Array<{ dt: number; dtTxt: string; eval: EvaluacionAplicacion; tC: number; rh: number; windMs: number; pop: number }> = [];

  /** La configuración va plegada al final; el resultado es lo primero que se ve */
  configAbierta = false;

  constructor(
    private estaciones: EstacionesService,
    private advisor: SprayAdvisorService,
    private kp: KpService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private modalCtrl: ModalController,
    private router: Router,
    private cuaderno: CuadernoService,
  ) { }

  /** Lleva las condiciones de «Ahora» al formulario del Cuaderno de aplicaciones */
  anotarAplicacion() {
    if (!this.evalActual) return;
    const a = this.ahora;
    this.cuaderno.condicionesPendientes = {
      estacion: this.origenUbicacion === 'ESTACION' && this.estacionNombre ? this.estacionNombre : (this.climaActual?.name ?? null),
      tC: a?.tC ?? null,
      rh: a?.rh ?? null,
      vientoKmh: a?.medioKmh ?? null,
      rafagaKmh: a?.rafagaKmh ?? null,
      direccion: a?.deg != null ? this.windDirLabel(a.deg) : null,
      deltaT: Number.isFinite(this.evalActual.deltaT) ? this.evalActual.deltaT : null,
      semaforo: this.evalActual.semaforo,
      estimado: !!a && (a.estimado.temp || a.estimado.hum || a.estimado.viento),
      metodo: this.metodoCorto,
      cultivo: this.cultivo,
    };
    this.router.navigate(['/tabs/cuaderno'], { queryParams: { nueva: Date.now() } });
  }

  ngOnInit() {
    this.usarUbicacionDeEstacion(true);
    // ✅ setea gota usual según el método default
    this.setTamGotaDefaultPorMetodo();
  }

  ionViewWillEnter() {
    this.origenUbicacion = 'ESTACION';
    this.usarUbicacionDeEstacion(true);
    this.setTamGotaDefaultPorMetodo();
  }

  // ====== UI HANDLERS ======
  onMetodoChanged() {
    // si el usuario nunca tocó gota, aplico default “usual” por método
    this.setTamGotaDefaultPorMetodo();
    this.onParamsChanged();
  }

  onTamGotaChanged() {
    this.tamGotaTouched = true;
    this.onParamsChanged();
  }

  onTipoProductoChanged() {
    this.onParamsChanged();
  }

  private setTamGotaDefaultPorMetodo() {
    if (this.tamGotaTouched) return;

    // “Usual” por método (simple y práctico)
    switch (this.metodo) {
      case 'AIRBLAST':
        this.tamGota = 'FINA';
        break;
      case 'DRON':
      case 'AVION':
        this.tamGota = 'FINA';
        break;
      case 'MANUAL':
      case 'MOSQUITO':
      default:
        this.tamGota = 'MEDIA';
        break;
    }
  }

  private usarUbicacionDeEstacion(cargarLuego: boolean) {
    const datosRaw = localStorage.getItem('datos');
    if (!datosRaw) return;

    try {
      const datos = JSON.parse(datosRaw);
      const lat = Number(datos?.lat);
      const lon = Number(datos?.lon);
      const nombre = datos?.nombre ?? datos?.name ?? null;
      this.gpsNombre = null;

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        this.lat = lat;
        this.lon = lon;
        this.estacionNombre = nombre;
        if (cargarLuego) this.cargarTodo();
      }
    } catch {
      // nada
    }
  }

  async toast(msg: string) {
    const t = await this.toastCtrl.create({ message: msg, duration: 2200, position: 'bottom' });
    await t.present();
  }

  async cargarTodo() {
    if (this.lat == null || this.lon == null) {
      this.usarUbicacionDeEstacion(false);
    }
    if (this.lat == null || this.lon == null) {
      await this.toast('No se pudo determinar ubicación (ni estación ni GPS).');
      return;
    }

    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Cargando condiciones...',
    });
    await loading.present();

    try {
      await Promise.all([this.cargarKp(), this.cargarActual(), this.cargarPronostico()]);
      loading.dismiss();
    } catch (e) {
      console.error(e);
      loading.dismiss();
      await this.toast('Error consultando OpenWeatherMap.');
    }
  }

  async refrescarKp() {
    await this.cargarKp(true);
    this.onParamsChanged();
  }

  private async cargarKp(showToastOnFail: boolean = false) {
    this.kpLoading = true;
    return new Promise<void>((resolve) => {
      this.kp.getLatestKp().subscribe({
        next: (r) => {
          this.kpIndex = Number(r.kp.toFixed(2));
          this.kpTimeTag = r.timeTag;
          this.kpLoading = false;
          resolve();
        },
        error: async (err) => {
          console.warn('[KP] Error leyendo SWPC', err);
          this.kpLoading = false;
          if (showToastOnFail) {
            await this.toast('No se pudo obtener Kp (NOAA). Se mantiene el último valor.');
          }
          resolve();
        }
      });
    });
  }

  /** «Ahora»: el último registro de la estación y, para lo que falte, OpenWeatherMap */
  private async cargarActual() {
    if (this.lat == null || this.lon == null) return;

    const owm = new Promise<void>((resolve) => {
      this.estaciones.getClimaActual(this.lat!, this.lon!).subscribe((json) => {
        this.climaActual = json;
        this.gpsNombre = (json?.name ?? null);
        this.lugarNombre = (json?.name ?? null);
        resolve();
      }, _ => resolve());
    });

    const id = this.origenUbicacion === 'ESTACION' ? this.idEstacionElegida() : null;
    const estacion = new Promise<void>((resolve) => {
      if (!id) {
        this.datoEstacion = null;
        resolve();
        return;
      }
      this.estaciones.getDatos(id).subscribe((dato) => {
        this.datoEstacion = dato;
        resolve();
      }, _ => {
        this.datoEstacion = null;
        resolve();
      });
    });

    await Promise.all([owm, estacion]);
    this.evalActual = this.evaluarActual();
  }

  private idEstacionElegida(): string | null {
    try {
      const datos = JSON.parse(localStorage.getItem('datos') ?? 'null');
      const id = datos?.Identificacion ?? localStorage.getItem('estacion');
      return id != null && String(id) !== '' ? String(id) : null;
    } catch {
      return localStorage.getItem('estacion');
    }
  }

  private async cargarPronostico() {
    if (this.lat == null || this.lon == null) return;

    return new Promise<void>((resolve) => {
      this.estaciones.getPronostico(this.lat!, this.lon!).subscribe((json) => {
        const list = (json?.list ?? []) as any[];
        this.pronostico = list;
        this.evalPronostico = this.evaluarPronostico(list, json?.city);
        resolve();
      }, _ => resolve());
    });
  }

  onParamsChanged() {
    if (this.climaActual || this.datoEstacion) this.evalActual = this.evaluarActual();
    if (this.pronostico?.length) this.evalPronostico = this.evaluarPronostico(this.pronostico, null);
  }

  /**
   * «Ahora» con las mismas reglas que la página web (SprayAdvisorService.evaluarRegistro): el último
   * registro de la estación; si falta un valor, el sensor está dado de baja o el registro tiene más de
   * una hora, la estimación de OpenWeatherMap (marcada «estimado»). Con la ubicación del celular, sólo
   * OpenWeatherMap.
   */
  private evaluarActual(): EvaluacionAplicacion | null {
    const st = this.origenUbicacion === 'ESTACION' ? this.datoEstacion : null;
    const owm = this.climaActual;
    const num = (v: any): number | null => {
      if (v == null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const fechaI = String(st?.fecha_I ?? '');
    const f = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(fechaI);
    const instanteSt = f ? Date.UTC(+f[1], +f[2] - 1, +f[3], +f[4] + 3, +f[5]) : null; // hora local UTC−3
    const vigente = instanteSt != null && Date.now() - instanteSt <= MINUTOS_REGISTRO_VIGENTE * 60000;

    const estOk = (v: number | null, min: number, max: number) => vigente && v != null && v >= min && v <= max;
    const stT = num(st?.temp_af), stH = num(st?.hum_af), stV = num(st?.viento_medio), stR = num(st?.viento_max);
    const owmV = num(owm?.wind?.speed), owmG = num(owm?.wind?.gust);
    const owmMedio = owmV != null ? owmV * 3.6 * VIENTO_10M_A_3M : null;
    const owmRafaga = owmG != null && owmV != null ? Math.max(owmG, owmV) * 3.6 * VIENTO_10M_A_3M : owmMedio;

    const usaT = estOk(stT, -30, 55), usaH = estOk(stH, 1, 100), usaV = estOk(stV, 0, 200) && estOk(stR, 0, 200);
    const valores: ValoresAhora = {
      tC: usaT ? stT : num(owm?.main?.temp),
      rh: usaH ? stH : num(owm?.main?.humidity),
      medioKmh: usaV ? stV : owmMedio,
      rafagaKmh: usaV ? stR : owmRafaga,
      deg: usaV ? this.gradosDeRumbo(st?.direc) : num(owm?.wind?.deg),
      estimado: { temp: !usaT, hum: !usaH, viento: !usaV }
    };
    this.ahora = valores;

    // Lluvia: la de los últimos 15 minutos de la estación; si no, la última hora de OpenWeatherMap
    const lluvia = vigente && num(st?.rr_15) != null ? num(st?.rr_15) : (num(owm?.rain?.['1h']) ?? 0);
    const reg: RegistroMeteo = {
      instante: new Date(usaT && instanteSt != null ? instanteSt : Date.now()),
      lat: this.lat, lon: this.lon,
      temperatura: valores.tC, humedad: valores.rh,
      vientoMedio: valores.medioKmh, rafaga: valores.rafagaKmh, lluvia
    };
    const r = this.advisor.evaluarRegistro(reg, {
      metodo: this.metodo, cultivo: this.cultivo, prioridad: this.prioridad, ...this.extrasDecision()
    });
    if (!r.evaluacion) return null;
    return this.applyProductoExtras(r.evaluacion, {
      tC: valores.tC as number, rh: valores.rh as number, windMs: (valores.rafagaKmh as number) / 3.6
    });
  }

  private gradosDeRumbo(rumbo: any): number | null {
    const rumbos = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const i = rumbos.indexOf(String(rumbo ?? '').toUpperCase().replace(/[^A-Z]/g, ''));
    return i >= 0 ? i * 22.5 : null;
  }

  /**
   * Pronóstico con las mismas reglas que la página web: viento llevado a 3 m, ráfaga (si viene menor
   * que el medio, el medio), salida y puesta del sol de cada día y la probabilidad de lluvia.
   */
  private evaluarPronostico(list: any[], city: any): Array<{ dt: number; dtTxt: string; eval: EvaluacionAplicacion; tC: number; rh: number; windMs: number; pop: number }> {
    return (list ?? [])
      .slice(0, 12)
      .map((it) => {
        const tC = Number(it?.main?.temp ?? 0);
        const rh = Number(it?.main?.humidity ?? 0);
        const medioMs = Number(it?.wind?.speed ?? 0) * VIENTO_10M_A_3M;
        const gustMs = it?.wind?.gust != null ? Math.max(Number(it.wind.gust) * VIENTO_10M_A_3M, medioMs) : medioMs;
        const pop = Number(it?.pop ?? 0);
        const dtUtc = Number(it?.dt ?? 0);
        // Hora local de Tucumán (dt_txt de OpenWeatherMap está en UTC)
        const local = new Date((dtUtc - 3 * 3600) * 1000); // UTC−3
        const dtTxt = this.fechaHoraCorta(local);
        const sol = this.lat != null && this.lon != null
          ? salidaPuestaSol(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate(), this.lat, this.lon)
          : null;

        const weather = Array.isArray(it?.weather)
          ? it.weather.map((w: any) => ({
            id: Number(w?.id),
            main: w?.main,
            description: w?.description,
          }))
          : undefined;

        const base = this.advisor.evaluar(
          {
            tC, rh, windMs: medioMs, gustMs, pop, dtUtc,
            sunriseUtc: sol ? Math.floor(sol.salidaMs / 1000) : undefined,
            sunsetUtc: sol ? Math.floor(sol.puestaMs / 1000) : undefined, weather
          },
          this.metodo,
          this.cultivo,
          this.prioridad,
          this.extrasDecision()
        );

        const ev = this.applyProductoExtras(base, { tC, rh, windMs: gustMs });

        return { dt: dtUtc, dtTxt, eval: ev, tC, rh, windMs: medioMs, pop };
      });
  }

  colorFor(semaforo: string) {
    if (semaforo === 'VERDE') return 'success';
    if (semaforo === 'AMARILLO') return 'warning';
    return 'danger';
  }

  /**
   * El tramo más largo de horas seguidas en VERDE de las próximas 36 h (si no hay, en AMARILLO), para no
   * tener que leer la lista. null si todo está en ROJO.
   */
  get mejorMomento(): { semaforo: string; texto: string } | null {
    for (const semaforo of ['VERDE', 'AMARILLO']) {
      let mejor: { i: number; n: number } | null = null;
      let inicio = -1;
      this.evalPronostico.forEach((it, i) => {
        if (it.eval.semaforo === semaforo) {
          if (inicio < 0) inicio = i;
          const n = i - inicio + 1;
          if (!mejor || n > mejor.n) mejor = { i: inicio, n };
        } else {
          inicio = -1;
        }
      });
      if (mejor) {
        const { i, n } = mejor as { i: number; n: number };
        return { semaforo, texto: this.textoTramo(this.evalPronostico[i].dt, this.evalPronostico[i + n - 1].dt) };
      }
    }
    return null;
  }

  /** «hoy de 9 a 15 h», «mañana a las 6 h», «desde hoy 21 h hasta mañana 3 h» (dt en segundos UTC) */
  private textoTramo(dtDesde: number, dtHasta: number): string {
    const local = (dt: number) => new Date((dt - 3 * 3600) * 1000); // UTC−3, se leen los campos UTC
    const a = local(dtDesde);
    const b = local(dtHasta);
    const ahora = local(Date.now() / 1000);
    const dia = (d: Date) => {
      const diff = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
        - Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate())) / 86400000);
      return diff === 0 ? 'hoy' : diff === 1 ? 'mañana' : this.fechaHoraCorta(d).split(' · ')[0];
    };
    if (dtDesde === dtHasta) return `${dia(a)} a las ${a.getUTCHours()} h`;
    if (dia(a) === dia(b)) return `${dia(a)} de ${a.getUTCHours()} a ${b.getUTCHours()} h`;
    return `desde ${dia(a)} ${a.getUTCHours()} h hasta ${dia(b)} ${b.getUTCHours()} h`;
  }

  /** «lun 16/11 · 21 h» a partir de una fecha ya corrida a UTC−3 (se leen los campos UTC) */
  private fechaHoraCorta(local: Date): string {
    const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const dd = String(local.getUTCDate()).padStart(2, '0');
    const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
    return `${dias[local.getUTCDay()]} ${dd}/${mm} · ${local.getUTCHours()} h`;
  }

  /**
   * La razón que explica el color: la primera marcada con el mismo semáforo («… (ROJO).»). Si ninguna
   * lo dice (inversión, por ejemplo, no lleva marca y va primera), la primera de la lista.
   */
  motivoPrincipal(ev: EvaluacionAplicacion): string {
    const razones = ev?.razones ?? [];
    return razones.find((r) => r.includes(`(${ev.semaforo})`)) ?? razones[0] ?? '';
  }

  /** Lo que muestra el selector cerrado: «Mosquito (terrestre)» no entra a 375 px */
  get metodoCorto(): string {
    return METODOS_CORTOS[this.metodo] ?? this.metodo;
  }

  /** Mismos cortes que la ayuda de 'SCORES': 0–34 bajo, 35–65 medio, más de 65 alto */
  nivelRiesgo(score: number): string {
    if (score > 65) return 'Alto';
    if (score >= 35) return 'Medio';
    return 'Bajo';
  }

  /** Resumen de la configuración plegada: «El Colmenar · Mosquito · Caña · Herbicida · gota media» */
  get resumenConfig(): string {
    const metodos = METODOS_CORTOS;
    const cultivos: Record<string, string> = { 'CAÑA': 'Caña', CITRUS: 'Citrus', GRANOS: 'Granos' };
    const productos: Record<string, string> = {
      HERBICIDA: 'Herbicida', FUNGICIDA: 'Fungicida', INSECTICIDA: 'Insecticida',
    };
    const gotas: Record<string, string> = {
      MUY_FINA: 'muy fina', FINA: 'fina', MEDIA: 'media', GRUESA: 'gruesa', MUY_GRUESA: 'muy gruesa',
    };
    const lugar = this.origenUbicacion === 'GPS'
      ? (this.lugarNombre || 'Ubicación del celular')
      : (this.estacionNombre || 'Estación');

    return [
      lugar,
      metodos[this.metodo] ?? this.metodo,
      cultivos[this.cultivo] ?? this.cultivo,
      productos[this.tipoProducto] ?? this.tipoProducto,
      `gota ${gotas[this.tamGota] ?? this.tamGota}`,
    ].join(' · ');
  }

  formatWindMsToKmh(ms: any): string {
    const n = Number(ms);
    if (!Number.isFinite(n)) return '— km/h';
    return `${Math.round(n * 3.6)} km/h`;
  }

  private usarGnssEnDecision(): boolean {
    return this.metodo === 'DRON' || this.metodo === 'AVION';
  }

  private extrasDecision() {
    return {
      kpIndex: this.kpIndex,
      sats: this.usarGnssEnDecision() ? this.sats : undefined,
      gotaGruesa: this.tamGota === 'GRUESA' || this.tamGota === 'MUY_GRUESA'
    };
  }

  async openInfo(
    key: 'DELTA_T' | 'INVERSION' | 'POP' | 'VIENTO' | 'KP' | 'GNSS' | 'SCORES' | 'FORECAST_HELP' | 'CONSEJOS') {

    let title = '';
    let body: string[] = [];

    switch (key) {
      case 'DELTA_T':
        title = 'ΔT (Delta T)';
        body = [
          'ΔT es un indicador práctico del potencial de evaporación de la gota.',
          'ΔT alto: la gota se achica rápido → más deriva y menor depósito.',
          'Guía: 2–8 (mejor), 8–10 (precaución), >10–12 (alto riesgo), según gota/etiqueta.',
          'Acciones: gota más gruesa, menor altura, evitar horas de máximo calor.'
        ];
        break;

      case 'INVERSION':
        title = 'Inversión térmica (riesgo)';
        body = [
          'En inversión el aire queda estable y la nube puede viajar lejos sin dispersarse.',
          'Frecuente de noche/madrugada con viento muy bajo y humedad alta.',
          'Riesgo principal: deriva a larga distancia (especialmente dron/avión).',
          'Acción: evitar aplicar; si es imprescindible, aumentar tamaño de gota y alejarse de bordes.'
        ];
        break;

      case 'POP':
        title = 'PoP / Lluvia';
        body = [
          'PoP es la probabilidad de precipitación del bloque (3h).',
          'No indica cuánta lluvia: la cantidad puede venir como lluvia acumulada del período.',
          'Riesgo: lavado del producto según “rainfastness” de la etiqueta.'
        ];
        break;

      case 'VIENTO':
        title = 'Viento y ráfagas';
        body = [
          'El viento es el principal factor de deriva.',
          'Las ráfagas pueden aumentar deriva aunque el promedio sea aceptable.',
          'Si el viento va hacia áreas sensibles, no aplicar.'
        ];
        break;

      case 'KP':
        title = 'Kp (índice geomagnético)';
        body = [
          'Kp mide actividad geomagnética. En algunos casos puede afectar GNSS/compás.',
          'Guía: <4 normal; 4–5 precaución; ≥5 puede degradar precisión, especialmente dron/avión.'
        ];
        break;

      case 'GNSS':
        title = 'GNSS (satélites / precisión)';
        body = [
          'Cantidad de satélites disponibles/usados para posición.',
          'Más relevante en dron/avión (navegación, bordes).',
          'Si es bajo, aumentar márgenes y evitar operar cerca de zonas sensibles.'
        ];
        break;

      case 'FORECAST_HELP':
        title = 'Cómo leer el pronóstico';
        body = [
          'Temp/HR: afectan evaporación.',
          'Viento: principal deriva.',
          'PoP: riesgo de lavado y eficacia.',
          'El semáforo resume el balance deriva/eficacia según método y prioridad.'
        ];
        break;

      case 'CONSEJOS':
        title = 'Por qué el sistema recomienda esto';
        body = this.buildConsejosExplainBody(this.evalActual);
        break;
 
      case 'SCORES':
        title = 'Riesgos';
        body = [
          '0–34: bajo (bueno)',
          '35–65: medio (precaución)',
          '>65: alto (riesgo)'
        ];
        break;
    }

    const modal = await this.modalCtrl.create({
      component: InfoModalComponent,
      componentProps: { title, body }
    });

    await modal.present();
  }

  private buildConsejosExplainBody(ev: EvaluacionAplicacion | null): string[] {
    if (!ev) {
      return ['Todavía no hay evaluación disponible.', 'Actualizá condiciones y volvé a intentar.'];
    }

    const lines: string[] = [];
    lines.push(`Método: ${this.metodo} · Cultivo: ${this.cultivo} · Prioridad: ${this.prioridad}`);
    lines.push(`Producto: ${this.tipoProducto} · Gota: ${this.tamGota}`);
    lines.push(`Semáforo: ${ev.semaforo}`);

    lines.push('—');
    lines.push(`Deriva (score): ${ev.scoreDeriva}`);
    lines.push(`Eficacia (score): ${ev.scoreEficacia}`);

    lines.push('—');
    lines.push(`ΔT: ${decimal(ev.deltaT, 1)} °C`);
    lines.push(`Inversión probable: ${ev.inversionProbable ? 'Sí' : 'No'}`);

    lines.push('—');
    lines.push('Factores que empujaron la decisión:');
    if (ev.razones?.length) for (const r of ev.razones) lines.push(`• ${r}`);
    else lines.push('• (No se registraron razones)');

    lines.push('—');
    lines.push('Qué podés hacer:');
    if (ev.recomendaciones?.length) for (const r of ev.recomendaciones) lines.push(`• ${r}`);
    else lines.push('• (No se registraron recomendaciones)');

    lines.push('—');
    lines.push(`Extras: Kp=${decimal(this.kpIndex, 1)} · Satélites=${this.sats}`);

    return lines;
  }

  async openPorQueAhora() {
    // usa tu modal existente, sin cambiar tu estructura
    const modal = await this.modalCtrl.create({
      component: InfoModalComponent,
      componentProps: {
        title: 'Por qué el sistema recomienda esto',
        body: this.buildConsejosExplainBody(this.evalActual)
      }
    });
    await modal.present();
  }

  windIconRotate(deg: any): number {
    const n = Number(deg);
    if (!Number.isFinite(n)) return 0;
    return n - 45;
  }

  windDirLabel(deg: any): string {
    const n = Number(deg);
    if (!Number.isFinite(n)) return '—';
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const idx = Math.round(((n % 360) / 22.5)) % 16;
    return dirs[idx];
  }

  // ✅ AQUÍ está el “cambio real” de recomendaciones/condicionantes
  private applyProductoExtras(
    ev: EvaluacionAplicacion,
    ctx: { tC: number | null; rh: number | null; windMs: number | null }
  ): EvaluacionAplicacion {
    if (!ev) return ev;

    const razones = Array.isArray((ev as any).razones) ? [...(ev as any).razones] : [];
    const recomendaciones = Array.isArray((ev as any).recomendaciones) ? [...(ev as any).recomendaciones] : [];

    const tipo = this.tipoProducto;
    const gota = this.tamGota;

    const windMs = ctx?.windMs ?? null;
    const windKmh = windMs != null ? windMs * 3.6 : null;
    const temp = ctx?.tC ?? null;
    const rh = ctx?.rh ?? null;

    // severidad simple por tamaño de gota (deriva)
    const drift =
      gota === 'MUY_FINA' ? 4 :
      gota === 'FINA' ? 3 :
      gota === 'MEDIA' ? 2 :
      gota === 'GRUESA' ? 1 : 0;

    // === Reglas prácticas (no cambian el semáforo base; agregan contexto)
    if (tipo === 'HERBICIDA') {
      if (gota === 'MUY_FINA' || gota === 'FINA' || gota === 'MEDIA') {
        razones.push('Herbicida: mayor riesgo de deriva con gota fina/media.');
        recomendaciones.push('Para herbicidas se recomienda gota GRUESA o MUY GRUESA (boquillas antideriva) y viento bajo.');
      }
      if (windKmh != null && windKmh >= 8 && drift >= 2) {
        razones.push('Viento moderado con gota fina/media incrementa la deriva (herbicida).');
        recomendaciones.push('Reducí deriva: gota más gruesa, bajar altura, disminuir velocidad o reprogramar.');
      }
    }

    if (tipo === 'INSECTICIDA' || tipo === 'FUNGICIDA') {
      if (gota === 'MUY_GRUESA') {
        razones.push('Gota muy gruesa puede reducir cobertura en blanco biológico.');
        recomendaciones.push('Con viento bajo, considerá GRUESA o MEDIA según etiqueta para mejorar cobertura.');
      }
      if ((gota === 'MUY_FINA' || gota === 'FINA') && windKmh != null && windKmh >= 8) {
        razones.push('Gota fina con viento moderado aumenta deriva.');
        recomendaciones.push('Con viento moderado evitá gota fina; preferí MEDIA/GRUESA.');
      }
    }

    // Calor + HR baja: reforzar evaporación (útil para cualquiera, más crítico con gota fina)
    if ((temp != null && temp >= 30) && (rh != null && rh <= 55) && drift >= 3) {
      razones.push('Condiciones secas/calor con gota fina: aumenta evaporación y deriva.');
      recomendaciones.push('Si no podés reprogramar: subí tamaño de gota y evitá horas de máximo calor.');
    }

    return {
      ...(ev as any),
      razones,
      recomendaciones,
    } as any;
  }

  // ===== GPS =====
  async tomarUbicacion() {
    const isNative = Capacitor.isNativePlatform();

    if (!isNative) {
      if (!navigator.geolocation) {
        await this.toast('Este navegador no permite geolocalización.');
        return;
      }
      this.usandoGps = true;
      this.estacionNombre = null;
      this.lugarNombre = null;

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          this.lat = pos.coords.latitude;
          this.lon = pos.coords.longitude;
          this.origenUbicacion = 'GPS';
          this.usandoGps = false;
          await this.cargarTodo();
        },
        async () => {
          this.usandoGps = false;
          await this.toast('No se pudo obtener la ubicación. Revisá permisos del navegador.');
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
      return;
    }

    this.usandoGps = true;

    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Obteniendo ubicación...',
    });

    await loading.present();

    try {
      const perm = await Geolocation.checkPermissions();

      if (perm.location !== 'granted') {
        const req = await Geolocation.requestPermissions({ permissions: ['location'] });
        if (req.location !== 'granted') throw new Error('PERMISO_DENEGADO');
      }

      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      });

      this.lat = pos.coords.latitude;
      this.lon = pos.coords.longitude;
      this.origenUbicacion = 'GPS';

      await loading.dismiss();
      this.usandoGps = false;

      await this.cargarTodo();

    } catch (e: any) {
      await loading.dismiss();
      this.usandoGps = false;

      if (String(e?.message || '').includes('PERMISO_DENEGADO')) {
        await this.toast('Permiso de ubicación denegado. Activá “Ubicación” para esta app en Ajustes.');
      } else {
        console.error('[GPS] Error:', e);
        await this.toast('No se pudo obtener la ubicación. Revisá GPS/Permisos y volvé a intentar.');
      }
    }
  }

  get kpTimeShort(): string | null {
    const tag = this.kpTimeTag;
    if (!tag) return null;

    try {
      let s = tag.trim();
      const hasUTC = /\bUTC\b/i.test(s);
      s = s.replace(/\s*UTC\s*$/i, '');
      if (/^\d{4}-\d{2}-\d{2}\s+\d/.test(s)) s = s.replace(' ', 'T');
      if (!/[zZ]|[+\-]\d{2}:?\d{2}$/.test(s)) s += 'Z';

      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        const fmt = new Intl.DateTimeFormat('es-AR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: hasUTC ? 'UTC' : undefined,
        });
        return fmt.format(d).replace(',', '');
      }
    } catch { }

    const m = tag.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    if (m) return `${m[1]} ${m[2]}`;
    return tag.slice(0, 16);
  }
}
