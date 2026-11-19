import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MapaTab } from 'src/app/components/mapa-segment/mapa-segment.component';
import { COLOR_RAYOS, EstacionesService, ImagenSatelite } from 'src/app/services/estaciones.service';
import { CompartirService } from 'src/app/services/compartir.service';
import { OWM_LAYERS, OwmLayerKey } from 'src/app/shared/owm-weather-layer.util';

const MODOS: MapaTab[] = ['mapat', 'mapathoy', 'mapa-rr', 'mapaheladas', 'satelite'];

/** Qué muestra cada modo: el selector sólo dice «Ahora», «Hoy», «Lluvia», «Heladas» */
const DESCRIPCIONES: Record<MapaTab, string> = {
  mapat: 'Temperatura del último registro de cada estación',
  mapathoy: 'Temperatura máxima o mínima de hoy',
  'mapa-rr': 'Lluvia de las últimas 24 horas',
  mapaheladas: 'Temperatura mínima y heladas del día, el mes o el año',
  satelite: 'Nubes vistas desde el satélite: no muestra la lluvia',
};

/** NOAA publica una imagen cada 10 minutos */
const SATELITE_MINUTOS = 10;

@Component({
  selector: 'app-mapa',
  templateUrl: './mapa.page.html',
  styleUrls: ['./mapa.page.scss'],
})
export class MapaPage {
  mode: MapaTab = 'mapat';

  /**
   * Los botones de Temperatura, Lluvia y Heladas abren esta pestaña con ?modo=… (antes abrían el mismo
   * mapa suelto, sin pestaña marcada y con la leyenda tapada por la barra de pestañas).
   */
  constructor(route: ActivatedRoute, private estaciones: EstacionesService, private compartir: CompartirService) {
    route.queryParamMap.subscribe((params) => {
      const modo = params.get('modo') as MapaTab;
      if (MODOS.includes(modo)) this.cambiarModo(modo);
    });
  }

  satelite: ImagenSatelite | null = null;
  sateliteCargando = false;
  sateliteError = false;
  private sateliteConsultado = 0;

  ionViewWillEnter() {
    if (this.mode === 'satelite') this.cargarSatelite();
  }

  cambiarModo(modo: MapaTab) {
    this.mode = modo;
    if (modo === 'satelite') this.cargarSatelite();
  }

  /** Pide la imagen al entrar al modo, salvo que la última consulta tenga menos de 10 minutos */
  cargarSatelite() {
    if (this.sateliteCargando) return;
    if (this.satelite && Date.now() - this.sateliteConsultado < SATELITE_MINUTOS * 60000) return;

    this.sateliteCargando = true;
    this.estaciones.getSateliteNoa().subscribe(res => {
      this.sateliteCargando = false;
      this.sateliteError = !res;
      if (res) {
        this.satelite = res;
        this.sateliteConsultado = Date.now();
      }
    });
  }

  /** Comparte la imagen con la hora, las referencias y las dos fuentes (NOAA y la Sección) */
  compartirSatelite() {
    const s = this.satelite;
    if (!s) return;
    const notas: string[] = [];
    if (s.rayos) notas.push('Rayos detectados por el satélite');
    else if (s.rayos === 0) notas.push('Sin rayos detectados en la zona');
    if (s.producto === 'Sandwich') notas.push('Temperatura aproximada del tope de las nubes: amarillo y rojo, tormentas fuertes');
    notas.push('San Miguel de Tucumán en el círculo amarillo');
    this.compartir.compartir({
      titulo: 'Imagen satelital del NOA',
      subtitulo: `${s.hora.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${this.sateliteHora.split(' · ')[0]} (hora del barrido)`,
      imagen: s.imagen,
      notas,
      colorNota: s.rayos ? `rgb(${COLOR_RAYOS.join(', ')})` : undefined,
      escala: s.producto === 'Sandwich'
        ? { colores: ['#00007f', '#0000ff', '#00c8ff', '#3cff96', '#ffff00', '#ff7f00', '#ff0000', '#7f0000'], desde: '−33 °C', hasta: '−73 °C' }
        : undefined,
      fuenteImagen: `Imagen: ${this.sateliteFuente}`,
      marcarCentro: true,
      nombre: 'satelite-noa',
      formato: 'jpeg',
    });
  }

  get sateliteFuente(): string {
    const producto = this.satelite?.producto === 'Sandwich' ? 'Sandwich' : 'GeoColor';
    return `NOAA/NESDIS/STAR · GOES-19 ${producto}${this.satelite?.rayos != null ? ' y rayos (GLM)' : ''}`;
  }

  /** «17:20 · hace 25 min» (hora del barrido, en la hora del celular) */
  get sateliteHora(): string {
    if (!this.satelite) return '';
    const hora = this.satelite.hora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as Intl.DateTimeFormatOptions);
    const minutos = Math.max(0, Math.round((Date.now() - this.satelite.hora.getTime()) / 60000));
    const hace = minutos < 120 ? `hace ${minutos} min` : `hace ${Math.round(minutos / 60)} h`;
    return `${hora} · ${hace}`;
  }

  get descripcion(): string {
    return DESCRIPCIONES[this.mode];
  }

  capaClima: OwmLayerKey | null = null;
  capasDisponibles = OWM_LAYERS;

  toggleCapaClima(layer: OwmLayerKey) {
    this.capaClima = this.capaClima === layer ? null : layer;
  }

  /**
   * Las capas climáticas (precipitación/nubes/viento/temp) son "del momento".
   * Heladas y Hoy muestran datos agregados/históricos, no tiene sentido
   * superponerles una condición climática puntual.
   */
  get mostrarCapaClima(): boolean {
    return this.mode === 'mapat' || this.mode === 'mapa-rr';
  }
}
