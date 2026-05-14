import { Component, OnInit, OnDestroy } from '@angular/core';
import { LoadingController } from '@ionic/angular';
import { Router } from '@angular/router';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { Subscription } from 'rxjs';

type ModoHeladas = 'dia' | 'mes' | 'anio';

@Component({
  selector: 'app-heladas',
  templateUrl: './heladas.page.html',
  styleUrls: ['./heladas.page.scss'],
})
export class HeladasPage implements OnInit, OnDestroy {
  private stationSub?: Subscription;
  private estacionActualId: string | null = null;
  dato: any = {};
  ubicacion = '../../assets/wheater-icons/ubicacion.png';
  mapas = '../../assets/tab-icons/btnMapas.png';

  // UI
  modo: ModoHeladas = 'dia';
  showAll = false;

  // Resumen (estación seleccionada)
  tMin: number | null = null;
  fphSel: string | null = null;
  fuhSel: string | null = null;
  durMaxSel: number | null = null;
  durTotalSel: number | null = null;
  diasSel: number | null = null;
  registrosSel: number | null = null;

  // Listas
  rowsDiaMes: any[] = [];     // filas con helada (fph != null)
  rowsAnio: any[] = [];       // filas agrupadas { nombre, identificacion, cur, prev }

  // Año actual/prev detectados desde la respuesta
  anioActual = new Date().getFullYear();
  anioPrev = this.anioActual - 1;

  // Fecha/hora UI (si ya la armabas, mantenela)
  hora = '';
  diaSemana = '';
  dia = '';
  nombreMes = '';
  anio = '';

  // ✅ NUEVO / CLAVE: dataset listo para tabla anual comparativa
  helAnioRows: Array<{
    identificacion: string;
    nombre: string;
    tAct: number | null;
    tPrev: number | null;
    diasAct: number;
    diasPrev: number;
    regAct: number;
    regPrev: number;
  }> = [];
  resumenPeriodoItems: Array<{ label: string; value: string; hint?: string; tone?: string }> = [];

  constructor(
    private pronostico: EstacionesService,
    private loadingCtrl: LoadingController,
    private router: Router
  ) { }

  async ngOnInit() {
    this.estacionActualId = localStorage.getItem('estacion');
    this.dato = this.safeParse(localStorage.getItem('datos')) || {};

    await this.cargarModo(this.modo);

    this.stationSub = this.pronostico.stationChanged$.subscribe(async estacion => {
      if (!estacion) return;

      const cambioLocalidad =
        this.estacionActualId !== null &&
        this.estacionActualId !== estacion;

      this.estacionActualId = estacion;

      if (!cambioLocalidad) {
        return;
      }

      this.showAll = false;

      try {
        const nuevoDato = await this.pronostico.getDatos(estacion).toPromise();

        if (nuevoDato) {
          this.dato = nuevoDato;
          localStorage.setItem('datos', JSON.stringify(nuevoDato));
        } else {
          this.dato = this.safeParse(localStorage.getItem('datos')) || {};
        }

        await this.cargarModo(this.modo);
      } catch {
        this.dato = this.safeParse(localStorage.getItem('datos')) || {};
        await this.cargarModo(this.modo);
      }
    });
  }

  ngOnDestroy() {
    this.stationSub?.unsubscribe();
  }

  async onModoChange(value: ModoHeladas) {
    this.modo = value;
    this.showAll = false;
    await this.cargarModo(value);
  }

  onClickHoy() {
    this.router.navigate(['tabs/mapaheladas']);
  }

  get rowsVisibles(): any[] {
    // En año probablemente uses helAnioRows en el HTML,
    // pero dejo esta compatibilidad con lo que ya tenías:
    const base = this.modo === 'anio' ? this.rowsAnio : this.rowsDiaMes;
    if (!Array.isArray(base)) return [];
    return this.showAll ? base : base.slice(0, 12);
  }

  get hayFilas(): boolean {
    if (this.modo === 'anio') return this.helAnioRows.length > 0;
    return this.rowsVisibles.length > 0;
  }

  get tituloPeriodo(): string {
    if (this.modo === 'dia') return 'Hoy';
    if (this.modo === 'mes') return 'Mes';
    return `Año ${this.anioActual} vs ${this.anioPrev}`;
  }

  get estadoPrincipal(): string {
    if (this.modo === 'anio') {
      if (this.tMin == null) return 'Sin datos';
      return this.tMin <= 0 ? 'Heladas registradas' : 'Sin heladas registradas';
    }
    if (this.tMin == null) return 'Sin datos';
    return this.tMin < 0 ? 'Helada registrada' : 'Sin heladas en esta localidad';
  }

  // --------- CARGA ---------

  private async cargarModo(modo: ModoHeladas) {
    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Cargando...',
    });
    await loading.present();

    try {
      if (modo === 'dia') {
        const res = await this.pronostico.getHelDia().toPromise();
        this.procesarDiaMes(res);
      } else if (modo === 'mes') {
        const res = await this.pronostico.getHelMes().toPromise();
        this.procesarDiaMes(res);
      } else {
        const res = await this.pronostico.getHelAnio().toPromise();
        this.procesarAnio(res);
      }
    } catch (e) {
      console.log('[HELADAS] ERROR:', e);
      this.rowsDiaMes = [];
      this.rowsAnio = [];
      this.helAnioRows = [];
      this.resetResumen();
    } finally {
      loading.dismiss().catch(() => { });
    }
  }

  private procesarDiaMes(data: any[]) {
    const all = Array.isArray(data) ? data : [];

    const conHelada = all
      .filter(r => r && r.fph != null) // solo estaciones con helada
      .map(r => ({
        ...r,
        temperatura: this.toNum(r.temperatura),
        duracion: this.toNum(r.duracion),
        duracion_t: this.toNum(r.duracion_t),
        dias: this.toNum(r.dias),
        registros: this.toNum(r.registros),
      }))
      .sort((a, b) => (a.temperatura ?? 999) - (b.temperatura ?? 999));

    this.rowsDiaMes = conHelada;

    // En dia/mes, no usamos helAnioRows
    this.helAnioRows = [];
    this.rowsAnio = [];

    // Resumen de estación seleccionada
    const idSel = String(this.dato?.Identificacion ?? this.dato?.identificacion ?? '');
    const rowSel = all.find(r => String(r?.identificacion ?? r?.Identificacion ?? '') === idSel) || null;

    const t = this.toNum(rowSel?.temperatura);
    this.tMin = Number.isFinite(t as any) ? t : null;

    this.fphSel = rowSel?.fph ?? null;
    this.fuhSel = rowSel?.fuh ?? null;
    this.durMaxSel = this.toNum(rowSel?.duracion);
    this.durTotalSel = this.toNum(rowSel?.duracion_t);
    this.diasSel = this.toNum(rowSel?.dias);
    this.registrosSel = this.toNum(rowSel?.registros);
    this.updateResumenPeriodoDiaMes();
  }

  private procesarAnio(data: any[]) {
    const all = Array.isArray(data) ? data : [];

    // Detecto año actual desde la respuesta
    const years = all.map(r => Number(r?.anio)).filter(n => Number.isFinite(n));
    this.anioActual = years.length ? Math.max(...years) : new Date().getFullYear();
    this.anioPrev = this.anioActual - 1;

    // Agrupo por estación para mantener tu rowsAnio (compat)
    const map = new Map<string, any>();

    for (const r of all) {
      const key = String(r?.identificacion ?? '');
      if (!key) continue;

      if (!map.has(key)) {
        map.set(key, {
          identificacion: key,
          nombre: r?.nombre ?? '',
          alt: r?.alt ?? null,
          lat: r?.lat ?? null,
          lon: r?.lon ?? null,
          cur: null,
          prev: null,
        });
      }

      const obj = map.get(key);
      const y = Number(r?.anio);

      const row = {
        ...r,
        anio: y,
        temperatura: this.toNum(r?.temperatura),
        duracion: this.toNum(r?.duracion),
        duracion_t: this.toNum(r?.duracion_t),
        dias: this.toNum(r?.dias),
        registros: this.toNum(r?.registros),
        fph: r?.fph ?? null,
        fuh: r?.fuh ?? null,
      };

      if (y === this.anioActual) obj.cur = row;
      if (y === this.anioPrev) obj.prev = row;
    }

    this.rowsAnio = Array.from(map.values())
      .sort((a, b) => (a?.cur?.temperatura ?? 999) - (b?.cur?.temperatura ?? 999));

    // ✅ DATASET PARA LA TABLA ANUAL: t + dias + registros (ambos años)
    this.helAnioRows = this.rowsAnio.map(x => {
      const cur = x.cur || null;
      const prev = x.prev || null;

      return {
        identificacion: String(x.identificacion),
        nombre: x.nombre,
        tAct: this.toNum(cur?.temperatura),
        tPrev: this.toNum(prev?.temperatura),
        diasAct: Number(cur?.dias ?? 0),
        diasPrev: Number(prev?.dias ?? 0),
        regAct: Number(cur?.registros ?? 0),
        regPrev: Number(prev?.registros ?? 0),
      };
    });

    // Si querés ordenar por mínima más baja en el año actual:
    this.helAnioRows.sort((a, b) => (a.tAct ?? 999) - (b.tAct ?? 999));

    // Resumen estación seleccionada (toma AÑO ACTUAL)
    const idSel = String(this.dato?.Identificacion ?? this.dato?.identificacion ?? '');
    const sel = this.rowsAnio.find(x => String(x.identificacion) === idSel) || null;

    const tCur = this.toNum(sel?.cur?.temperatura);
    this.tMin = Number.isFinite(tCur as any) ? tCur : null;

    this.fphSel = sel?.cur?.fph ?? null;
    this.fuhSel = sel?.cur?.fuh ?? null;
    this.durMaxSel = this.toNum(sel?.cur?.duracion);
    this.durTotalSel = this.toNum(sel?.cur?.duracion_t);
    this.diasSel = this.toNum(sel?.cur?.dias);
    this.registrosSel = this.toNum(sel?.cur?.registros);
    this.updateResumenPeriodoAnio();
  }

  private resetResumen() {
    this.tMin = null;
    this.fphSel = null;
    this.fuhSel = null;
    this.durMaxSel = null;
    this.durTotalSel = null;
    this.diasSel = null;
    this.registrosSel = null;
    this.resumenPeriodoItems = [];
  }

  // --------- HELPERS UI ---------

  nivelPorTemp(temp: number | null): 'reddark' | 'red' | 'orange' | 'warn' | 'nt' {
    if (temp == null) return 'nt';
    if (temp <= -6) return 'reddark';
    if (temp <= -4) return 'red';
    if (temp <= -2) return 'orange';
    if (temp <= 0) return 'warn';
    return 'nt';
  }

  fmtTemp(n: any): string {
    const v = this.toNum(n);
    return Number.isFinite(v as any) ? (v as number).toFixed(1) : 'S/D';
  }

  fmtNum(n: any): string {
    const v = this.toNum(n);
    return Number.isFinite(v as any) ? String(v) : 'S/D';
  }

  fmtDate(s: any): string {
    if (!s) return '—';
    const str = String(s);
    if (str.length >= 10 && str.includes('-')) {
      const y = str.slice(0, 4);
      const m = str.slice(5, 7);
      const d = str.slice(8, 10);
      return `${d}-${m}-${y}`;
    }
    return str;
  }

  private fmtFechaHelada(v: any): string {
    if (!v) return 'S/D';

    const s = String(v);

    // Formato YYYY-MM-DD o YYYY-MM-DD HH:mm:ss
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      return `${s.substring(8, 10)}/${s.substring(5, 7)}`;
    }

    // Formato YYYYMMDD
    if (/^\d{8}$/.test(s)) {
      return `${s.substring(6, 8)}/${s.substring(4, 6)}`;
    }

    return s;
  }

  private fechaOrden(v: any): string {
    if (!v) return '';

    const s = String(v);

    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      return s.substring(0, 10);
    }

    if (/^\d{8}$/.test(s)) {
      return `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;
    }

    return s;
  }

  private fmtHoras(v: any): string {
    const n = this.toNum(v);

    if (!Number.isFinite(n as any)) {
      return 'S/D';
    }

    return `${(n as number).toFixed(1)} h`;
  }

  private toNum(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private safeParse(value: string | null) {
    if (!value) return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  goLocalidades() {
    this.router.navigate(['/localidades']);
  }

  private updateResumenPeriodoDiaMes() {
    const rows = Array.isArray(this.rowsDiaMes) ? this.rowsDiaMes : [];

    if (!rows.length) {
      this.resumenPeriodoItems = [];
      return;
    }

    const minRow = rows.reduce((acc, r) =>
      (this.toNum(r?.temperatura) ?? 999) < (this.toNum(acc?.temperatura) ?? 999) ? r : acc,
      rows[0]
    );

    const maxDurRow = rows.reduce((acc, r) =>
      (this.toNum(r?.duracion) ?? 0) > (this.toNum(acc?.duracion) ?? 0) ? r : acc,
      rows[0]
    );

    const primeraRow = rows
      .filter(r => r?.fph)
      .sort((a, b) => this.fechaOrden(a.fph).localeCompare(this.fechaOrden(b.fph)))[0];

    const ultimaRow = rows
      .filter(r => r?.fuh)
      .sort((a, b) => this.fechaOrden(b.fuh).localeCompare(this.fechaOrden(a.fuh)))[0];

    const totalDiasHelada = rows.reduce((acc, r) => acc + (this.toNum(r?.dias) ?? 0), 0);
    const totalHorasBajo0 = rows.reduce((acc, r) => acc + (this.toNum(r?.duracion_t) ?? 0), 0);

    this.resumenPeriodoItems = [
      {
        label: 'Estaciones con helada',
        value: String(rows.length),
        hint: this.modo === 'dia' ? 'hoy' : 'en el mes',
        tone: 'cold',
      },
      {
        label: 'Mínima provincial',
        value: `${this.fmtTemp(minRow?.temperatura)} °C`,
        hint: minRow?.nombre || '',
        tone: this.nivelPorTemp(minRow?.temperatura),
      },
      {
        label: 'Primera provincial',
        value: this.fmtFechaHelada(primeraRow?.fph),
        hint: primeraRow?.nombre || '',
        tone: 'cold',
      },
      {
        label: 'Última provincial',
        value: this.fmtFechaHelada(ultimaRow?.fuh),
        hint: ultimaRow?.nombre || '',
        tone: 'cold',
      },
      {
        label: 'Horas bajo 0 °C',
        value: this.fmtHoras(totalHorasBajo0),
        hint: `${totalDiasHelada} días con helada acumulados`,
        tone: totalHorasBajo0 > 0 ? 'cold' : '',
      },
      {
        label: 'Mayor duración diaria',
        value: this.fmtHoras(maxDurRow?.duracion),
        hint: maxDurRow?.nombre || '',
        tone: 'cold',
      },
    ];
  }

  private updateResumenPeriodoAnio() {
    const rows = Array.isArray(this.rowsAnio) ? this.rowsAnio : [];

    if (!rows.length) {
      this.resumenPeriodoItems = [];
      return;
    }

    const conActual = rows.filter(r => r?.cur);

    if (!conActual.length) {
      this.resumenPeriodoItems = [];
      return;
    }

    const conHeladaActual = conActual.filter(r => (this.toNum(r?.cur?.dias) ?? 0) > 0);
    const conHeladaPrev = rows.filter(r => (this.toNum(r?.prev?.dias) ?? 0) > 0);

    if (!conHeladaActual.length) {
      this.resumenPeriodoItems = [
        {
          label: 'Estaciones c/helada',
          value: '0',
          hint: `${this.anioActual}`,
        },
        {
          label: 'Vs año anterior',
          value: `${0 - conHeladaPrev.length}`,
          hint: `comparado con ${this.anioPrev}`,
          tone: conHeladaPrev.length > 0 ? 'warn' : '',
        },
      ];
      return;
    }

    const minActual = conHeladaActual.reduce((acc, r) =>
      (this.toNum(r?.cur?.temperatura) ?? 999) < (this.toNum(acc?.cur?.temperatura) ?? 999) ? r : acc,
      conHeladaActual[0]
    );

    const masDias = conHeladaActual.reduce((acc, r) =>
      (this.toNum(r?.cur?.dias) ?? 0) > (this.toNum(acc?.cur?.dias) ?? 0) ? r : acc,
      conHeladaActual[0]
    );

    const maxDurRow = conHeladaActual.reduce((acc, r) =>
      (this.toNum(r?.cur?.duracion) ?? 0) > (this.toNum(acc?.cur?.duracion) ?? 0) ? r : acc,
      conHeladaActual[0]
    );

    const primeraRow = conHeladaActual
      .filter(r => r?.cur?.fph)
      .sort((a, b) => this.fechaOrden(a.cur.fph).localeCompare(this.fechaOrden(b.cur.fph)))[0];

    const ultimaRow = conHeladaActual
      .filter(r => r?.cur?.fuh)
      .sort((a, b) => this.fechaOrden(b.cur.fuh).localeCompare(this.fechaOrden(a.cur.fuh)))[0];

    const totalHoras = conHeladaActual.reduce(
      (acc, r) => acc + (this.toNum(r?.cur?.duracion_t) ?? 0),
      0
    );

    const diferenciaEstaciones = conHeladaActual.length - conHeladaPrev.length;

    this.resumenPeriodoItems = [
      {
        label: 'Estaciones c/helada',
        value: String(conHeladaActual.length),
        hint: `${this.anioActual}`,
        tone: 'cold',
      },
      {
        label: 'Mínima anual',
        value: `${this.fmtTemp(minActual?.cur?.temperatura)} °C`,
        hint: minActual?.nombre || '',
        tone: this.nivelPorTemp(minActual?.cur?.temperatura),
      },
      {
        label: 'Primera helada',
        value: this.fmtFechaHelada(primeraRow?.cur?.fph),
        hint: primeraRow?.nombre || '',
        tone: 'cold',
      },
      {
        label: 'Última helada',
        value: this.fmtFechaHelada(ultimaRow?.cur?.fuh),
        hint: ultimaRow?.nombre || '',
        tone: 'cold',
      },
      {
        label: 'Más días c/helada',
        value: this.fmtNum(masDias?.cur?.dias),
        hint: masDias?.nombre || '',
        tone: 'cold',
      },
      {
        label: 'Horas bajo 0 °C',
        value: this.fmtHoras(totalHoras),
        hint: 'acumulado provincial',
        tone: 'cold',
      },
      {
        label: 'Mayor duración diaria',
        value: this.fmtHoras(maxDurRow?.cur?.duracion),
        hint: maxDurRow?.nombre || '',
        tone: 'cold',
      },
      {
        label: 'Vs año anterior',
        value: `${diferenciaEstaciones >= 0 ? '+' : ''}${diferenciaEstaciones}`,
        hint: `estaciones con helada ${this.anioActual}/${this.anioPrev}`,
        tone: diferenciaEstaciones > 0 ? 'warn' : '',
      },
    ];
  }

}