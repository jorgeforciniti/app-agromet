import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { CondicionesAplicacion, CuadernoService, RegistroAplicacion } from '../services/cuaderno.service';
import { CuentaService } from '../services/cuenta.service';
import { CuentaSyncService } from '../services/cuenta-sync.service';
import { decimal } from '../shared/formato';

/** «2026-11-19T10:30» de ahora, en la hora del celular */
function ahoraLocal(): string {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/**
 * Cuaderno de aplicaciones: lo que se aplicó (lote, producto, dosis) con las condiciones del momento,
 * que vienen de la pantalla Aplicaciones («Anotar esta aplicación»). También se puede anotar a mano,
 * sin condiciones (por ejemplo, una aplicación de otro día). Queda guardado en el celular y, con
 * sesión iniciada (Más → Cuenta), también en la cuenta.
 */
@Component({
  selector: 'app-cuaderno',
  templateUrl: './cuaderno.page.html',
  styleUrls: ['./cuaderno.page.scss'],
})
export class CuadernoPage {

  registros: RegistroAplicacion[] = [];

  /** Formulario abierto */
  anotando = false;
  condiciones: CondicionesAplicacion | null = null;
  fecha = ahoraLocal();
  lote = '';
  producto = '';
  dosis = '';
  notas = '';

  constructor(
    route: ActivatedRoute,
    private cuaderno: CuadernoService,
    private alertCtrl: AlertController,
    public cuenta: CuentaService,
    private cuentaSync: CuentaSyncService,
  ) {
    // La sincronización con la cuenta también cambia la lista
    this.cuaderno.cambio$.subscribe(() => this.registros = this.cuaderno.lista());
    // Desde Aplicaciones llega ?nueva=… con las condiciones en el servicio
    route.queryParamMap.subscribe(params => {
      if (params.get('nueva') && this.cuaderno.condicionesPendientes) {
        this.nueva(this.cuaderno.condicionesPendientes);
        this.cuaderno.condicionesPendientes = null;
      }
    });
  }

  ionViewWillEnter() {
    this.registros = this.cuaderno.lista();
    if (this.cuenta.sesion) this.cuentaSync.sincronizarCuaderno();
  }

  /** Abre el formulario; propone el lote y el producto de la última aplicación */
  nueva(condiciones: CondicionesAplicacion | null = null) {
    const ultimo = this.cuaderno.ultimo();
    this.condiciones = condiciones;
    this.fecha = ahoraLocal();
    this.lote = ultimo?.lote ?? '';
    this.producto = ultimo?.producto ?? '';
    this.dosis = ultimo?.dosis ?? '';
    this.notas = '';
    this.anotando = true;
  }

  get puedeGuardar(): boolean {
    return !!this.fecha && !!(this.lote.trim() || this.producto.trim());
  }

  guardar() {
    if (!this.puedeGuardar) return;
    this.cuaderno.agregar({
      fecha: this.fecha.slice(0, 16),
      lote: this.lote.trim(),
      producto: this.producto.trim(),
      dosis: this.dosis.trim(),
      notas: this.notas.trim(),
      condiciones: this.condiciones,
    });
    this.anotando = false;
  }

  cancelar() {
    this.anotando = false;
  }

  async borrar(r: RegistroAplicacion) {
    const alerta = await this.alertCtrl.create({
      header: 'Borrar la aplicación',
      message: `${this.fechaTexto(r.fecha)} · ${this.queTexto(r)}. No se puede deshacer.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Borrar', role: 'destructive', handler: () => {
            this.cuaderno.borrar(r.id);
          }
        },
      ],
    });
    await alerta.present();
  }

  /** «Lote 5 · Glifosato · 2 L/ha» */
  queTexto(r: RegistroAplicacion): string {
    return [r.lote, r.producto, r.dosis].filter(Boolean).join(' · ');
  }

  /** «19/11/2026 10:30» */
  fechaTexto(fecha: string): string {
    if (!fecha || fecha.length < 16) return fecha;
    return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)} ${fecha.slice(11, 16)}`;
  }

  /** «El Colmenar · 23 °C · HR 76 % · viento 4 km/h NE · ΔT 3,1 · Mosquito, caña» */
  condicionesTexto(c: CondicionesAplicacion | null): string {
    if (!c) return '';
    const partes: string[] = [];
    if (c.estacion) partes.push(c.estacion);
    if (c.tC != null) partes.push(`${Math.round(c.tC)} °C`);
    if (c.rh != null) partes.push(`HR ${Math.round(c.rh)} %`);
    if (c.vientoKmh != null) partes.push(`viento ${Math.round(c.vientoKmh)} km/h${c.direccion ? ' ' + c.direccion : ''}`);
    if (c.deltaT != null) partes.push(`ΔT ${decimal(c.deltaT, 1)}`);
    partes.push(`${c.metodo}, ${c.cultivo.toLowerCase()}`);
    return partes.join(' · ') + (c.estimado ? ' · *estimado' : '');
  }

  semaforoTexto(c: CondicionesAplicacion): string {
    // Los mismos textos que el resumen de Inicio
    return { VERDE: 'Condiciones aceptables', AMARILLO: 'Con precaución', ROJO: 'No recomendable' }[c.semaforo];
  }
}
