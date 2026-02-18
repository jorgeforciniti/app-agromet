import { Component, OnInit } from '@angular/core';
import { LoadingController, ToastController, ModalController } from '@ionic/angular';
import { EstacionesService } from '../services/estaciones.service';
import { SprayAdvisorService, MetodoAplicacion, Prioridad, Cultivo, EvaluacionAplicacion } from '../services/spray-advisor.service';
import { KpService } from '../services/kp.service';
import { InfoModalComponent } from './info-modal.component';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

@Component({
  selector: 'app-aplicaciones',
  templateUrl: './aplicaciones.page.html',
  styleUrls: ['./aplicaciones.page.scss'],
})
export class AplicacionesPage implements OnInit {

  imagen = '../../assets/fondos/eventos.jpg'; // fallback (si querés, cambiamos luego)

  // selección del usuario
  metodo: MetodoAplicacion = 'MOSQUITO';
  cultivo: Cultivo = 'CANA';
  prioridad: Prioridad = 'EQUILIBRADO';

  // “extras” (no vienen de OWM)
  kpIndex: number = 1;   // 0..9 (geomagnético)
  kpTimeTag: string | null = null;
  kpLoading = false;
  sats = 12;     // satélites GNSS visibles (si el usuario lo sabe / integra SDK)

  // ubicación
  lat: number | null = null;
  lon: number | null = null;
  usandoGps = false;
  origenUbicacion: 'ESTACION' | 'GPS' = 'ESTACION';
  estacionNombre: string | null = null;
  lugarNombre: string | null = null; // nombre devuelto por OWM para la coordenada actual

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
    private modalCtrl: ModalController,   // <-- acá
  ) { }

  ngOnInit() {
    // Por defecto: evaluar para la estación seleccionada (localStorage 'datos').
    // Si el usuario toca “Tomar ubicación del celular”, se recalcula con GPS.
    this.usarUbicacionDeEstacion(true);
  }

  ionViewWillEnter() {
    // Cada vez que se entra a la pestaña, volvemos al comportamiento por defecto
    // (estación seleccionada). El usuario puede sobreescribir con GPS.
    this.origenUbicacion = 'ESTACION';
    this.usarUbicacionDeEstacion(true);
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
    // Si no hay coordenadas, intentamos usar la estación seleccionada.
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
    return this.advisor.evaluar({ tC, rh, windMs, gustMs, pop: 0, dtUtc, tzSeconds: tz, sunriseUtc: sunrise, sunsetUtc: sunset, weather },
      this.metodo,
      this.cultivo,
      this.prioridad,
      this.extrasDecision()
    );

  }

  private evaluarPronostico(list: any[], city: any): Array<{ dt: number; dtTxt: string; eval: EvaluacionAplicacion; tC: number; rh: number; windMs: number; pop: number }> {
    const tz = city?.timezone != null ? Number(city.timezone) : (this.climaActual?.timezone ?? 0);
    const sunrise = city?.sunrise ?? this.climaActual?.sys?.sunrise;
    const sunset = city?.sunset ?? this.climaActual?.sys?.sunset;

    return (list ?? [])
      .slice(0, 12) // próximas ~36h (cada 3h)
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

        const ev = this.advisor.evaluar(
          { tC, rh, windMs, gustMs, pop, dtUtc, tzSeconds: tz, sunriseUtc: sunrise, sunsetUtc: sunset, weather },
          this.metodo,
          this.cultivo,
          this.prioridad,
          this.extrasDecision()
        );
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
    // KP siempre lo mando (sirve para dron/avión; en otros no molesta)
    // Sats SOLO para DRON/AVION
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
          'PoP es la probabilidad de precipitación en el período (en OpenWeatherMap suele venir en bloques de 3 horas).',
          'No indica cuánta lluvia: la cantidad (si está disponible) aparece como lluvia acumulada del período.',
          'Riesgo principal: lavado del producto y menor eficacia, dependiendo del tiempo de secado/resistencia al lavado (“rainfastness”) indicado en la etiqueta.'
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
          'Kp mide la actividad geomagnética. En algunos casos, una actividad elevada puede afectar la precisión del GNSS y/o el compás de ciertos equipos.',
          'Guía general: < 4 normal; 4–5 precaución; ≥ 5 puede degradar la precisión, especialmente en dron/avión.'
        ];
        break;

      case 'GNSS':
        title = 'GNSS (satélites / precisión)';
        body = [
          'Representa la cantidad de satélites de navegación que el receptor está usando o tiene disponibles en ese momento para calcular la posición.',
          'Valor por defecto: 12. Ajustalo según la información que tengas disponible (equipo/app).',
          'Es más relevante en dron/avión (navegación, líneas de trabajo y bordes).',
          'En manual/mosquito suele ser útil principalmente para georreferenciar o ubicar el punto en el mapa.',
          'Si el valor es bajo, aumentá márgenes de seguridad y evitá operar cerca de zonas sensibles.'
        ];
        break;

      case 'SCORES':
        title = 'Scores (Deriva y Eficacia)';
        body = [
          'Deriva: estima el riesgo de que la pulverización se desplace fuera del objetivo (por viento, ráfagas, estabilidad atmosférica/inversión y condiciones que favorecen gotas finas).',
          'Eficacia: estima el riesgo de pérdida de control por evaporación (p. ej., ΔT alto/aire seco) o por lavado si hay probabilidad de lluvia (PoP).',
          'Los scores se combinan para generar el semáforo: según la Prioridad elegida (Seguridad / Equilibrado / Eficacia), el sistema pondera más el riesgo de deriva o la pérdida de eficacia.',
          'Interpretación práctica: un score “malo” indica que conviene ajustar la técnica (gota, altura, velocidad, horario) o reprogramar la aplicación.'
        ];
        break;
      case 'FORECAST_HELP':
        title = 'Cómo leer el pronóstico';
        body = [
          'Temperatura: influye en evaporación (junto con HR).',
          'HR (humedad relativa): HR baja aumenta evaporación y puede subir la deriva por gotas más chicas.',
          'Viento: factor principal de deriva. Considerá también ráfagas si están disponibles.',
          'PoP: probabilidad de lluvia en el bloque (3 h). Si es alta, riesgo de lavado y menor eficacia.',
          'El semáforo del pronóstico resume el balance deriva/eficacia según el método y la prioridad elegidos.'
        ];
        break;
      case 'CONSEJOS':
        title = 'Por qué el sistema recomienda esto';
        body = this.buildConsejosExplainBody(this.evalActual);
        break;

    }

    const modal = await this.modalCtrl.create({
      component: InfoModalComponent,     // <-- acá va EXACTO
      componentProps: { title, body }
    });

    await modal.present();
  }

  private buildConsejosExplainBody(ev: EvaluacionAplicacion | null): string[] {
    if (!ev) {
      return [
        'Todavía no hay evaluación disponible.',
        'Actualizá condiciones y volvé a intentar.'
      ];
    }

    const lines: string[] = [];

    // Contexto
    lines.push(`Método: ${this.metodo} · Cultivo: ${this.cultivo} · Prioridad: ${this.prioridad}`);
    lines.push(`Semáforo: ${ev.semaforo}`);

    // Scores (existen en tu interface)
    lines.push('—');
    lines.push(`Deriva (score): ${ev.scoreDeriva}`);
    lines.push(`Eficacia (score): ${ev.scoreEficacia}`);

    // Variables clave (existen)
    lines.push('—');
    lines.push(`ΔT: ${ev.deltaT.toFixed(1)} °C`);
    lines.push(`Inversión probable: ${ev.inversionProbable ? 'Sí' : 'No'}`);

    // Razones (existen)
    lines.push('—');
    lines.push('Factores que empujaron la decisión:');
    if (ev.razones?.length) {
      for (const r of ev.razones) lines.push(`• ${r}`);
    } else {
      lines.push('• (No se registraron razones)');
    }

    // Recomendaciones (existen)
    lines.push('—');
    lines.push('Qué podés hacer:');
    if (ev.recomendaciones?.length) {
      for (const r of ev.recomendaciones) lines.push(`• ${r}`);
    } else {
      lines.push('• (No se registraron recomendaciones)');
    }

    // Extras reales que estás usando
    lines.push('—');
    lines.push(`Extras: Kp=${this.kpIndex.toFixed(1)} · Satélites=${this.sats}`);

    return lines;
  }


  async openConsejosFor(ev: EvaluacionAplicacion) {
    const modal = await this.modalCtrl.create({
      component: InfoModalComponent,
      componentProps: {
        title: 'Por qué el sistema recomienda esto',
        body: this.buildConsejosExplainBody(ev)
      }
    });
    await modal.present();
  }

  // --- EXPLICACIÓN DEL SEMÁFORO (por qué sale ROJO/AMARILLO/VERDE) ---

  get resumenPorQueAhora(): string[] {
    // Para mostrar 2-3 líneas en la UI (sin modal)
    if (!this.evalActual) return [];
    const r = this.evalActual.razones ?? [];
    const rec = this.evalActual.recomendaciones ?? [];
    // Prioridad: razones (2) + 1 recomendación principal
    const out: string[] = [];
    for (const x of r.slice(0, 2)) out.push(x);
    if (rec.length) out.push(rec[0]);
    return out;
  }

  private buildWhyBody(ev: EvaluacionAplicacion | null): { title: string; body: string[] } {
    if (!ev) {
      return {
        title: 'Por qué se recomienda esto',
        body: ['Todavía no hay evaluación disponible. Actualizá condiciones e intentá de nuevo.']
      };
    }

    // Valores actuales (para “explicar con números”)
    const tC = Number(this.climaActual?.main?.temp ?? NaN);
    const rh = Number(this.climaActual?.main?.humidity ?? NaN);
    const windMs = Number(this.climaActual?.wind?.speed ?? NaN);
    const gustMs = this.climaActual?.wind?.gust != null ? Number(this.climaActual.wind.gust) : null;
    const pop = 0; // en "actual" no hay PoP (solo en forecast)
    const windKmh = Number.isFinite(windMs) ? windMs * 3.6 : NaN;
    const gustKmh = gustMs != null && Number.isFinite(gustMs) ? gustMs * 3.6 : NaN;

    const title = `Por qué el semáforo está en ${ev.semaforo}`;

    const body: string[] = [];

    // Contexto
    body.push(`Método: ${this.metodo} · Cultivo: ${this.cultivo} · Prioridad: ${this.prioridad}`);
    body.push(`Deriva (score): ${ev.scoreDeriva} · Eficacia (score): ${ev.scoreEficacia}`);

    body.push('—');
    body.push('Factores que empujaron la decisión:');
    if (ev.razones?.length) {
      for (const x of ev.razones) body.push(`• ${x}`);
    } else {
      body.push('• (No se generaron razones en esta evaluación)');
    }

    body.push('—');
    body.push('Recomendaciones operativas:');
    if (ev.recomendaciones?.length) {
      for (const x of ev.recomendaciones) body.push(`• ${x}`);
    } else {
      body.push('• (No se generaron recomendaciones en esta evaluación)');
    }

    body.push('—');
    body.push('Valores usados:');
    if (Number.isFinite(tC)) body.push(`• Temp: ${tC.toFixed(1)} °C`);
    if (Number.isFinite(rh)) body.push(`• HR: ${rh.toFixed(0)} %`);
    if (Number.isFinite(windKmh)) body.push(`• Viento: ${windKmh.toFixed(0)} km/h`);
    if (Number.isFinite(gustKmh)) body.push(`• Ráfaga: ${gustKmh.toFixed(0)} km/h`);
    body.push(`• ΔT: ${ev.deltaT.toFixed(1)} °C`);
    body.push(`• Inversión probable: ${ev.inversionProbable ? 'Sí' : 'No'}`);
    body.push(`• PoP: ${Math.round(pop * 100)} %`);

    // Extras (si se usan)
    body.push('—');
    body.push(`Extras: Kp=${this.kpIndex.toFixed(1)} · GNSS satélites=${this.sats}`);

    return { title, body };
  }

  async openPorQueAhora() {
    const { title, body } = this.buildWhyBody(this.evalActual);

    const modal = await this.modalCtrl.create({
      component: InfoModalComponent,
      componentProps: { title, body }
    });
    await modal.present();
  }

  private buildWhyBodyForecast(item: { eval: EvaluacionAplicacion; tC: number; rh: number; windMs: number; pop: number; dtTxt: string }) {
    const ev = item.eval;
    const title = `Por qué ${item.dtTxt} está en ${ev.semaforo}`;
    const body: string[] = [];

    body.push(`Temp: ${item.tC.toFixed(1)} °C · HR: ${item.rh.toFixed(0)} % · Viento: ${(item.windMs * 3.6).toFixed(0)} km/h · PoP: ${(item.pop * 100).toFixed(0)} %`);
    body.push(`ΔT: ${ev.deltaT.toFixed(1)} °C · Inversión probable: ${ev.inversionProbable ? 'Sí' : 'No'}`);
    body.push('—');
    body.push('Razones:');
    for (const x of (ev.razones ?? [])) body.push(`• ${x}`);
    body.push('—');
    body.push('Recomendaciones:');
    for (const x of (ev.recomendaciones ?? [])) body.push(`• ${x}`);

    return { title, body };
  }

  async openPorQueForecast(item: any) {
    const { title, body } = this.buildWhyBodyForecast(item);
    const modal = await this.modalCtrl.create({
      component: InfoModalComponent,
      componentProps: { title, body }
    });
    await modal.present();
  }

  private async ensureLocationPermission(): Promise<boolean> {
    try {
      // En web, el browser gestiona el prompt; esto igual funciona.
      const status = await Geolocation.checkPermissions();

      // Capacitor v6 devuelve algo tipo: { location: 'granted' | 'denied' | 'prompt' | ... }
      if (status.location === 'granted') return true;

      const req = await Geolocation.requestPermissions();
      return req.location === 'granted';
    } catch (e) {
      console.warn('[GPS] check/request permissions error', e);
      return false;
    }
  }

  async tomarUbicacion() {
    // En web (ionic serve), Geolocation de Capacitor puede no comportarse igual.
    // Usamos navigator.geolocation como fallback.
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

    // ===== Native (Android / iOS) con Capacitor =====
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
      // 1) Ver permisos actuales
      const perm = await Geolocation.checkPermissions();

      // 2) Pedir si hace falta
      if (perm.location !== 'granted') {
        const req = await Geolocation.requestPermissions({
          permissions: ['location']
        });

        if (req.location !== 'granted') {
          throw new Error('PERMISO_DENEGADO');
        }
      }

      // 3) Obtener posición
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

    // 1) Intento: parse como fecha (si viene tipo ISO o similar)
    try {
      // Normalizo cosas típicas: "YYYY-MM-DD HH:MM:SS.000 UTC" -> ISO UTC
      let s = tag.trim();

      // Si viene con " UTC" al final, lo saco y fuerzo Z
      const hasUTC = /\bUTC\b/i.test(s);
      s = s.replace(/\s*UTC\s*$/i, '');

      // Si viene con espacio entre fecha y hora, lo paso a 'T'
      if (/^\d{4}-\d{2}-\d{2}\s+\d/.test(s)) s = s.replace(' ', 'T');

      // Si no tiene zona, lo fuerzo a UTC
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
          timeZone: hasUTC ? 'UTC' : undefined, // si decía UTC, lo fijo en UTC
        });
        return fmt.format(d).replace(',', '');
      }
    } catch {
      // sigo al fallback
    }

    // 2) Fallback: recortar "YYYY-MM-DD HH:MM"
    const m = tag.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    if (m) return `${m[1]} ${m[2]}`;

    // 3) Último recurso: devolver algo cortado
    return tag.slice(0, 16);
  }

  windIconRotate(deg: any): number {
    const n = Number(deg);
    if (!Number.isFinite(n)) return 0;
    return n - 45;
  }

  /** Convierte grados meteorológicos (0=N, 90=E) a punto cardinal (N, NNE, ...). */
  windDirLabel(deg: any): string {
    const n = Number(deg);
    if (!Number.isFinite(n)) return '—';
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const idx = Math.round(((n % 360) / 22.5)) % 16;
    return dirs[idx];
  }
  
}