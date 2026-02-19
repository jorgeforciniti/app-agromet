import { Component, OnInit } from '@angular/core';
import { LoadingController, ToastController, ModalController } from '@ionic/angular';
import { EstacionesService } from '../services/estaciones.service';
import { SprayAdvisorService, MetodoAplicacion, Prioridad, Cultivo, EvaluacionAplicacion } from '../services/spray-advisor.service';
import { KpService } from '../services/kp.service';
import { InfoModalComponent } from './info-modal.component';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

type MetodoApp = 'terrestre' | 'aerea' | 'drone';

// ✅ Extras de aplicación (simples, sin complicar UX)
type TipoProducto = 'HERBICIDA' | 'FUNGICIDA' | 'INSECTICIDA';
type TamGota = 'MUY_FINA' | 'FINA' | 'MEDIA' | 'GRUESA' | 'MUY_GRUESA';

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
  cultivo: Cultivo = 'CANA';
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
  pronostico: any[] = [];
  gpsNombre: string | null = null;

  evalActual: EvaluacionAplicacion | null = null;
  evalPronostico: Array<{ dt: number; dtTxt: string; eval: EvaluacionAplicacion; tC: number; rh: number; windMs: number; pop: number }> = [];

  constructor(
    private estaciones: EstacionesService,
    private advisor: SprayAdvisorService,
    private kp: KpService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private modalCtrl: ModalController,
  ) { }

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

  private async cargarActual() {
    if (this.lat == null || this.lon == null) return;

    return new Promise<void>((resolve) => {
      this.estaciones.getClimaActual(this.lat!, this.lon!).subscribe((json) => {
        this.climaActual = json;
        this.gpsNombre = (json?.name ?? null);
        this.lugarNombre = (json?.name ?? null);

        // ✅ Ahora SI afecta recomendaciones con extras de producto/gota
        this.evalActual = this.evaluarDesdeOWMActual(json);

        resolve();
      }, _ => resolve());
    });
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
    if (this.climaActual) this.evalActual = this.evaluarDesdeOWMActual(this.climaActual);
    if (this.pronostico?.length) this.evalPronostico = this.evaluarPronostico(this.pronostico, null);
  }

  private evaluarDesdeOWMActual(json: any): EvaluacionAplicacion {
    const tC = Number(json?.main?.temp ?? 0);
    const rh = Number(json?.main?.humidity ?? 0);
    const windMs = Number(json?.wind?.speed ?? 0);
    const gustMs = json?.wind?.gust != null ? Number(json.wind.gust) : undefined;
    const dtUtc = Number(json?.dt ?? 0);
    const tz = Number(json?.timezone ?? 0);
    const sunrise = Number(json?.sys?.sunrise ?? 0);
    const sunset = Number(json?.sys?.sunset ?? 0);

    const weather = Array.isArray(json?.weather)
      ? json.weather.map((w: any) => ({
        id: Number(w?.id),
        main: w?.main,
        description: w?.description,
      }))
      : undefined;

    const base = this.advisor.evaluar(
      { tC, rh, windMs, gustMs, pop: 0, dtUtc, tzSeconds: tz, sunriseUtc: sunrise, sunsetUtc: sunset, weather },
      this.metodo,
      this.cultivo,
      this.prioridad,
      this.extrasDecision()
    );

    // ✅ aplicar extras (producto + gota) también en “Ahora”
    return this.applyProductoExtras(base, { tC, rh, windMs });
  }

  private evaluarPronostico(list: any[], city: any): Array<{ dt: number; dtTxt: string; eval: EvaluacionAplicacion; tC: number; rh: number; windMs: number; pop: number }> {
    const tz = city?.timezone != null ? Number(city.timezone) : (this.climaActual?.timezone ?? 0);
    const sunrise = city?.sunrise ?? this.climaActual?.sys?.sunrise;
    const sunset = city?.sunset ?? this.climaActual?.sys?.sunset;

    return (list ?? [])
      .slice(0, 12)
      .map((it) => {
        const tC = Number(it?.main?.temp ?? 0);
        const rh = Number(it?.main?.humidity ?? 0);
        const windMs = Number(it?.wind?.speed ?? 0);
        const gustMs = it?.wind?.gust != null ? Number(it.wind.gust) : undefined;
        const pop = Number(it?.pop ?? 0);
        const dtUtc = Number(it?.dt ?? 0);
        const dtTxt = it?.dt_txt ?? new Date((dtUtc + tz) * 1000).toISOString();

        const weather = Array.isArray(it?.weather)
          ? it.weather.map((w: any) => ({
            id: Number(w?.id),
            main: w?.main,
            description: w?.description,
          }))
          : undefined;

        const base = this.advisor.evaluar(
          { tC, rh, windMs, gustMs, pop, dtUtc, tzSeconds: tz, sunriseUtc: sunrise, sunsetUtc: sunset, weather },
          this.metodo,
          this.cultivo,
          this.prioridad,
          this.extrasDecision()
        );

        // ✅ aplicar extras (producto + gota)
        const ev = this.applyProductoExtras(base, { tC, rh, windMs });

        return { dt: dtUtc, dtTxt, eval: ev, tC, rh, windMs, pop };
      });
  }

  colorFor(semaforo: string) {
    if (semaforo === 'VERDE') return 'success';
    if (semaforo === 'AMARILLO') return 'warning';
    return 'danger';
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
      sats: this.usarGnssEnDecision() ? this.sats : undefined
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
    lines.push(`ΔT: ${ev.deltaT.toFixed(1)} °C`);
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
    lines.push(`Extras: Kp=${this.kpIndex.toFixed(1)} · Satélites=${this.sats}`);

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
