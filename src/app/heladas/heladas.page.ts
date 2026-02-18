import { Component, OnInit } from '@angular/core';
import { LoadingController } from '@ionic/angular';
import { Router } from '@angular/router';
import { EstacionesService } from 'src/app/services/estaciones.service';

type ModoHeladas = 'dia' | 'mes' | 'anio';

@Component({
  selector: 'app-heladas',
  templateUrl: './heladas.page.html',
  styleUrls: ['./heladas.page.scss'],
})
export class HeladasPage implements OnInit {
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

  constructor(
    private pronostico: EstacionesService,
    private loadingCtrl: LoadingController,
    private router: Router
  ) { }

  async ngOnInit() {
    this.dato = this.safeParse(localStorage.getItem('datos')) || {};
    await this.cargarModo(this.modo);
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
  }

  private resetResumen() {
    this.tMin = null;
    this.fphSel = null;
    this.fuhSel = null;
    this.durMaxSel = null;
    this.durTotalSel = null;
    this.diasSel = null;
    this.registrosSel = null;
  }

  // --------- HELPERS UI ---------

  nivelPorTemp(temp: number | null): 'reddark' |'red' | 'orange' | 'warn' | 'nt' {
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
}
