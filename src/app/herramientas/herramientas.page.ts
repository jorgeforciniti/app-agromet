import { Component } from '@angular/core';
import { Router } from '@angular/router';
import {
  HerramientasService, ResultadoBalance, ResultadoFrio, ResultadoSumaTermica
} from '../services/herramientas.service';
import { decimal } from '../shared/formato';
import { DiaEnfermedad, Enfermedad, ENFERMEDADES } from '../shared/agro/enfermedades';

/** AAAA-MM-DD en hora local */
function fechaIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** AAAA-MM-DD → fecha local (new Date('AAAA-MM-DD') sería medianoche UTC: el día anterior acá) */
function aFecha(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

/** Fecha «desde» elegida (se recuerda en el celular) */
const CLAVE_DESDE = 'herramientas_desde';

/** Última enfermedad elegida (se recuerda en el celular) */
const CLAVE_ENFERMEDAD = 'herramientas_enfermedad';

/**
 * Herramientas agronómicas para la estación activa, con los valores por defecto de la web: una tarjeta
 * por herramienta con el resultado y un solo ajuste (la temperatura base). Para elegir fechas o ver el
 * detalle día por día está el sitio.
 */
@Component({
  selector: 'app-herramientas',
  templateUrl: './herramientas.page.html',
  styleUrls: ['./herramientas.page.scss'],
})
export class HerramientasPage {
  estacionId = '';
  estacionNombre = '';

  balance: ResultadoBalance | null = null;
  cargandoBalance = false;

  suma: ResultadoSumaTermica | null = null;
  cargandoSuma = false;
  baseSuma = 10;
  readonly basesSuma = [0, 5, 10, 12, 12.5, 15, 18];

  frio: ResultadoFrio | null = null;
  cargandoFrio = false;
  baseFrio = 7;
  readonly basesFrio = [7, 10];

  readonly enfermedades = ENFERMEDADES;
  codigoEnfermedad = Number(localStorage.getItem(CLAVE_ENFERMEDAD)) || ENFERMEDADES[0].codigo;
  dias: DiaEnfermedad[] | null = null;
  cargandoEnfermedad = false;
  /** Día cuyo resultado se lee abajo de los cuadros (por defecto, hoy) */
  diaElegido: DiaEnfermedad | null = null;
  /** La estación no tiene sensor de hoja mojada y la enfermedad lo necesita */
  sinSensorHoja = false;
  private tieneSensorHoja = true;

  constructor(private herramientas: HerramientasService, private router: Router) { }

  get enfermedad(): Enfermedad {
    return ENFERMEDADES.find(e => e.codigo === this.codigoEnfermedad) || ENFERMEDADES[0];
  }

  cargarEnfermedad() {
    localStorage.setItem(CLAVE_ENFERMEDAD, String(this.codigoEnfermedad));
    this.sinSensorHoja = this.enfermedad.requiereMojado && !this.tieneSensorHoja;
    this.dias = null;
    if (this.sinSensorHoja) return;

    const hasta = new Date();
    const desde = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate() - 6);
    this.cargandoEnfermedad = true;
    this.herramientas.enfermedad(this.estacionId, this.codigoEnfermedad, desde, hasta).subscribe(r => {
      this.dias = r;
      this.diaElegido = r?.length ? r[r.length - 1] : null;
      this.cargandoEnfermedad = false;
    });
  }

  /** «Hoy», «Ayer» o «Lun 10» */
  nombreDia(fecha: string, corto = false): string {
    const [a, m, d] = fecha.split('-').map(Number);
    const f = new Date(a, m - 1, d);
    const hoy = new Date();
    const diff = Math.round((new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime() - f.getTime()) / 86400000);
    if (!corto && diff === 0) return 'Hoy';
    if (!corto && diff === 1) return 'Ayer';
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return corto ? dias[f.getDay()].charAt(0) : `${dias[f.getDay()]} ${d}`;
  }

  /** Días con condiciones favorables (cualquier nivel por encima de bajo) en los 7 días */
  get diasFavorables(): number {
    return (this.dias || []).filter(d => d.tono !== 'low' && d.tono !== 'none').length;
  }

  ionViewWillEnter() {
    const id = localStorage.getItem('estacion') || '';
    if (id === this.estacionId && (this.balance || this.suma)) return;

    this.estacionId = id;
    const estaciones: any[] = JSON.parse(localStorage.getItem('estaciones') || '[]');
    const estacion = estaciones.find(e => String(e?.Identificacion) === id);
    this.estacionNombre = estacion?.nombre || '';
    // isSoil = 1: tiene sensor de hoja mojada (si la lista no lo trae, se intenta igual)
    this.tieneSensorHoja = estacion?.isSoil == null || String(estacion.isSoil) === '1';

    this.cargarEnfermedad();
    this.cargarBalance();
    this.cargarSuma();
    this.cargarFrio();
  }

  goEstaciones() {
    this.router.navigate(['/localidades']);
  }

  // ---------- Períodos (los mismos que usa la web por defecto) ----------

  private get ayer(): Date {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  }

  /** 1 de julio de la campaña en curso */
  private get inicioCampania(): Date {
    const hoy = new Date();
    return new Date(hoy.getMonth() >= 6 ? hoy.getFullYear() : hoy.getFullYear() - 1, 6, 1);
  }

  get textoCampania(): string {
    return `desde el 1/7/${this.inicioCampania.getFullYear()}`;
  }

  /** Las horas de frío interesan de mayo a septiembre */
  get enTemporadaDeFrio(): boolean {
    const mes = new Date().getMonth() + 1;
    return mes >= 5 && mes <= 9;
  }

  // ---------- Fecha «desde» (arriba de todo), común a suma térmica y horas de frío; hasta ayer ----------

  readonly mesesCortos = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  /** Período máximo (también lo controla horas-frio.php): así nadie pide desde 2006 */
  readonly DIAS_MAX = 365;

  desde = this.fechaRecordada();

  /** Último día que se puede elegir: ayer */
  get maxDesde(): string {
    return fechaIsoLocal(this.ayer);
  }

  get minDesde(): string {
    const a = this.ayer;
    return fechaIsoLocal(new Date(a.getFullYear(), a.getMonth(), a.getDate() - this.DIAS_MAX + 1));
  }

  /** Por defecto, el último 1 de mayo: toma la temporada de frío completa */
  private get desdePorDefecto(): Date {
    const a = this.ayer;
    return new Date(a.getMonth() >= 4 ? a.getFullYear() : a.getFullYear() - 1, 4, 1);
  }

  /** La fecha guardada si sigue dentro del máximo; si no, la de por defecto */
  private fechaRecordada(): string {
    const guardada = localStorage.getItem(CLAVE_DESDE);
    if (guardada && guardada >= this.minDesde && guardada <= this.maxDesde) return guardada;
    const def = fechaIsoLocal(this.desdePorDefecto);
    return def < this.minDesde ? this.minDesde : def;
  }

  cambiarDesde(valor: string) {
    const fecha = String(valor).slice(0, 10);
    if (!fecha || fecha === this.desde) return;
    this.desde = fecha;
    localStorage.setItem(CLAVE_DESDE, fecha);
    this.cargarSuma();
    this.cargarFrio();
  }

  /** «desde el 1/5/2026» */
  textoDesde(iso: string): string {
    const [a, m, d] = iso.split('-').map(Number);
    return `desde el ${d}/${m}/${a}`;
  }

  // ---------- Carga ----------

  cargarBalance() {
    this.cargandoBalance = true;
    this.herramientas.balanceHidrico(this.estacionId, this.inicioCampania, this.ayer).subscribe(r => {
      this.balance = r;
      this.cargandoBalance = false;
    });
  }

  cargarSuma() {
    this.cargandoSuma = true;
    this.herramientas.sumaTermica(this.estacionId, aFecha(this.desde), this.ayer, this.baseSuma).subscribe(r => {
      this.suma = r;
      this.cargandoSuma = false;
    });
  }

  cargarFrio() {
    this.cargandoFrio = true;
    this.herramientas.horasDeFrio(this.estacionId, aFecha(this.desde), this.ayer, this.baseFrio).subscribe(r => {
      this.frio = r;
      this.cargandoFrio = false;
    });
  }

  // ---------- Textos ----------

  num(n: number | null | undefined, digitos = 0): string {
    return n == null || !Number.isFinite(n) ? '—' : decimal(n, digitos);
  }

  get porcentajeAgua(): number | null {
    const alm = this.balance?.ultima?.almacenaje;
    return alm == null || !this.balance ? null : Math.round((alm / this.balance.cad) * 100);
  }

  /** Lectura simple del almacenaje (en % del CAD) */
  get lecturaAgua(): string {
    const p = this.porcentajeAgua;
    if (p == null) return '';
    if (p < 25) return 'Perfil muy seco';
    if (p < 50) return 'Perfil seco';
    if (p < 75) return 'Humedad intermedia';
    return 'Perfil húmedo';
  }

  baseTexto(b: number): string {
    return `${decimal(b, b % 1 ? 1 : 0)} °C`;
  }
}
