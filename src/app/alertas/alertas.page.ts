import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { parseAlertasPorArea, SmnAlerta } from 'src/app/shared/smn-alertas.util';

/** Días con el mismo nivel y el mismo texto del SMN juntos, para no repetir el párrafo por día */
interface AlertaAgrupada {
  clave: string;
  nivel: number;
  fechas: string[];
  descripcion: string;
  instrucciones: string[];
}

interface AreaAlertas {
  nombre: string;
  esAreaActual: boolean;
  alertas: AlertaAgrupada[];
}

interface AvisoFrioCalor {
  area: string;
  tipo: 'Frío' | 'Calor';
  nivel: number;
  actualizado: string;
}

@Component({
  selector: 'app-alertas',
  templateUrl: './alertas.page.html',
  styleUrls: ['./alertas.page.scss'],
})
export class AlertasPage implements OnInit, OnDestroy {
  cargando = true;

  areas: AreaAlertas[] = [];

  heladaEstacionNombre = '';
  heladaHoyActiva = false;
  heladaHoyTemp: number | null = null;

  avisosFrioCalor: AvisoFrioCalor[] = [];

  private stationSub?: Subscription;

  constructor(
    private estacionesService: EstacionesService,
    private router: Router
  ) { }

  ngOnInit() {
    this.cargarTodo();

    this.stationSub = this.estacionesService.stationChanged$.subscribe(() => {
      this.cargarTodo();
    });
  }

  ngOnDestroy() {
    this.stationSub?.unsubscribe();
  }

  refrescar(event: any) {
    this.cargarTodo(() => event?.target?.complete?.());
  }

  private cargarTodo(onDone?: () => void) {
    this.cargando = true;

    const estacionId = localStorage.getItem('estacion');
    const estacionNum = Number(estacionId);
    const esValles = [10, 11, 12, 31].includes(estacionNum);

    forkJoin({
      tuc: this.estacionesService.getSmnAlertByArea(3373).pipe(catchError(() => of(null))),
      valles: this.estacionesService.getSmnAlertByArea(3375).pipe(catchError(() => of(null))),
      heladas: this.estacionesService.getHelDia().pipe(catchError(() => of([]))),
      warning: this.estacionesService.getSmnWarning(),
    }).subscribe(({ tuc, valles, heladas, warning }) => {
      // Nivel 1 es la base "sin aviso relevante" del SMN: no se muestra, solo 2 en adelante.
      const alertasTuc = tuc?.warnings?.length
        ? parseAlertasPorArea('Tucumán', tuc).filter(a => (a?.nivel ?? 0) >= 2)
        : [];
      const alertasValles = valles?.warnings?.length
        ? parseAlertasPorArea('Valles Calchaquíes', valles).filter(a => (a?.nivel ?? 0) >= 2)
        : [];

      this.areas = [
        { nombre: 'Tucumán', esAreaActual: !esValles, alertas: this.agrupar(this.ordenar(alertasTuc)) },
        { nombre: 'Valles Calchaquíes', esAreaActual: esValles, alertas: this.agrupar(this.ordenar(alertasValles)) },
      ];

      this.procesarHeladaEstacionActual(heladas || []);
      this.procesarAvisosFrioCalor(warning);

      this.cargando = false;
      onDone?.();
    });
  }

  private procesarAvisosFrioCalor(warning: any) {
    const areas: Array<{ id: string; nombre: string }> = [
      { id: '3373', nombre: 'Tucumán' },
      { id: '3375', nombre: 'Valles Calchaquíes' },
    ];
    const tipos: Array<{ key: 'cold' | 'heat'; nombre: 'Frío' | 'Calor' }> = [
      { key: 'cold', nombre: 'Frío' },
      { key: 'heat', nombre: 'Calor' },
    ];

    const out: AvisoFrioCalor[] = [];

    for (const area of areas) {
      for (const tipo of tipos) {
        const entry = warning?.[tipo.key]?.[area.id];
        const nivel = Number(entry?.level);

        // Mismo criterio que el resto de la app: nivel >= 3 es lo relevante (amarillo/naranja/rojo).
        if (Number.isFinite(nivel) && nivel >= 3) {
          out.push({
            area: area.nombre,
            tipo: tipo.nombre,
            nivel,
            actualizado: entry?.updated || '',
          });
        }
      }
    }

    this.avisosFrioCalor = out;
  }

  private ordenar(lista: SmnAlerta[]): SmnAlerta[] {
    return [...lista].sort((a, b) => {
      const nb = (b?.nivel ?? 0) - (a?.nivel ?? 0);
      if (nb !== 0) return nb;
      return String(a?.dateISO ?? '').localeCompare(String(b?.dateISO ?? ''));
    });
  }

  /** Claves de las alertas con «Qué hacer» abierto */
  instruccionesAbiertas = new Set<string>();

  toggleInstrucciones(clave: string) {
    if (this.instruccionesAbiertas.has(clave)) this.instruccionesAbiertas.delete(clave);
    else this.instruccionesAbiertas.add(clave);
  }

  /** Junta los días que el SMN publica con el mismo nivel y el mismo texto (conserva el orden) */
  private agrupar(lista: SmnAlerta[]): AlertaAgrupada[] {
    const grupos = new Map<string, AlertaAgrupada>();

    for (const a of lista) {
      // Con el área: Tucumán y Valles suelen tener el mismo texto y se abrían juntas
      const clave = `${a.area}|${a.nivel}|${a.descripcion}|${a.instruccion}`;
      const grupo = grupos.get(clave);
      if (grupo) {
        grupo.fechas.push(a.fecha);
      } else {
        grupos.set(clave, {
          clave,
          nivel: a.nivel,
          fechas: [a.fecha],
          descripcion: a.descripcion,
          instrucciones: this.separarInstrucciones(a.instruccion),
        });
      }
    }

    return [...grupos.values()];
  }

  /** «1- Evitá salir. 2- No saques la basura…» → un renglón por instrucción */
  private separarInstrucciones(texto: string): string[] {
    const partes = String(texto || '')
      .split(/(?:^|\s)\d+\s*[-.)]\s+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    return partes;
  }

  private procesarHeladaEstacionActual(rows: any[]) {
    const dato = this.safeParse(localStorage.getItem('datos')) || {};
    const idSel = String(dato?.Identificacion ?? dato?.identificacion ?? '');

    this.heladaEstacionNombre = dato?.nombre || '';

    const rowSel = Array.isArray(rows)
      ? rows.find(r => String(r?.identificacion ?? r?.Identificacion ?? '') === idSel)
      : null;

    this.heladaHoyActiva = !!rowSel?.fph;
    const t = Number(rowSel?.temperatura);
    this.heladaHoyTemp = Number.isFinite(t) ? t : null;
  }

  private safeParse(value: string | null) {
    if (!value) return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  nivelClase(nivel: number): string {
    switch (nivel) {
      case 5: return 'nivel--rojo';
      case 4: return 'nivel--naranja';
      case 3: return 'nivel--amarillo';
      default: return 'nivel--normal';
    }
  }

  get hayAlertasCriticas(): boolean {
    return this.areas.some(a => a.alertas.some(al => (al.nivel ?? 0) >= 3))
      || this.heladaHoyActiva
      || this.avisosFrioCalor.length > 0;
  }

  goNotificaciones() {
    this.router.navigate(['/tabs/notificaciones']);
  }

  goMapaHeladas() {
    this.router.navigate(['/tabs/mapa'], { queryParams: { modo: 'mapaheladas' } });
  }
}
