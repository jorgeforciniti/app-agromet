import { Component, OnInit, AfterViewInit, OnChanges, SimpleChanges, Input } from '@angular/core';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { Router } from '@angular/router';
import { environment } from 'src/environments/environment';
import { agregarValor, mostrarValoresSegunZoom, popupEstacion } from 'src/app/shared/marcador-mapa';
import { OwmLayerKey, setOwmLayer, capaNecesitaEstiloCalles, esperarEstiloListo, esperarMapaIdle } from 'src/app/shared/owm-weather-layer.util';

declare var mapboxgl: any;
@Component({
  selector: 'app-mapat',
  templateUrl: './mapat.page.html',
  styleUrls: ['./mapat.page.scss'],
})
export class MapatPage implements OnInit, AfterViewInit, OnChanges {
  /** true cuando se lo embebe dentro de MapaPage (sin su propio header/ion-content). */
  @Input() embedded = false;

  /** Capa raster climática opcional (precipitación/nubes/viento/temp) superpuesta al mapa. */
  @Input() capaClima: OwmLayerKey | null = null;

  /** Referencias/leyenda colapsada por defecto para no tapar el mapa. */
  legendAbierta = false;

  private map: any;
  private estiloEsCalles = false;
  private cambiandoEstilo = false;

  private readonly ESTILO_SATELITAL = 'mapbox://styles/mapbox/satellite-streets-v11';
  private readonly ESTILO_CALLES = 'mapbox://styles/mapbox/streets-v11';

  private mensajes: any[] = [];
  private properties: any[] = [];
  private prueba: any;
  private color: string;
  private dia: string;
  private Mes: string;
  private anio: string;
  private hora: string;
  imagen: string;
  mapas: string;

  constructor(private estacionesService: EstacionesService, private router: Router) { }

  ngOnInit() {
    const raw = localStorage.getItem('estaciones');
    this.mensajes = raw ? JSON.parse(raw) : [];
    this.cargarImagen();
  }

  ngAfterViewInit(){
    mapboxgl.accessToken = environment.mapboxAccessToken;
    this.map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/satellite-streets-v11',
      center: [-65.3, -26.91],
      zoom: 7.1
      });

    const map = this.map;

    this.controles(map);

    this.estaciones();

    this.cargaDatosMapa(map);
    mostrarValoresSegunZoom(map);

    map.on('load', () => {
      this.agregarContornoTucuman();
      this.aplicarCapaClima();

      map.resize();
      }
    );
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.capaClima && this.map) {
      this.aplicarCapaClima();
    }
  }

  /** Solo el contorno de la provincia, sin relleno (para no taparse con las capas climáticas). */
  private agregarContornoTucuman() {
    if (this.map.getSource('tucuman')) return;

    this.map.addSource('tucuman', {
      type: 'geojson',
      data: '../../assets/icon/limites.geojson'
    });
    this.map.addLayer({
      id: 'tucuman-outline',
      type: 'line',
      source: 'tucuman',
      paint: {
        'line-color': '#00f6ed',
        'line-width': 2.2,
        'line-opacity': 0.85
      },
      filter: ['==', '$type', 'Polygon']
    });
  }

  /**
   * Precipitación y viento se ven con poco contraste sobre imagen satelital,
   * así que para esas dos capas cambiamos el mapa de fondo a estilo calles.
   *
   * Si ya hay un cambio de estilo en curso (por un click anterior), no hacemos
   * nada ahora: cuando ese cambio termine, se vuelve a llamar a este mismo
   * método, que relee this.capaClima y aplica lo más reciente. Así, clicks
   * rápidos y sucesivos convergen solos sin perderse ni quedar esperando algo
   * que capaz no llega (ver esperarEstiloListo).
   */
  private aplicarCapaClima() {
    if (!this.map || this.cambiandoEstilo) return;

    // Nunca tocamos sources/layers sin confirmar antes que el mapa ya
    // terminó de cargar su estilo (inicial o el de un cambio anterior).
    esperarEstiloListo(this.map, () => this.aplicarCapaClimaListo());
  }

  private aplicarCapaClimaListo() {
    const necesitaCalles = capaNecesitaEstiloCalles(this.capaClima);

    if (necesitaCalles !== this.estiloEsCalles) {
      this.estiloEsCalles = necesitaCalles;
      this.cambiandoEstilo = true;
      this.map.setStyle(necesitaCalles ? this.ESTILO_CALLES : this.ESTILO_SATELITAL);

      esperarMapaIdle(this.map, () => {
        this.cambiandoEstilo = false;
        this.agregarContornoTucuman();
        this.aplicarCapaClima();
      });
      return;
    }

    setOwmLayer(this.map, this.capaClima);
  }

  private controles(map: any) {
    map.addControl(new mapboxgl.NavigationControl());
    map.addControl(new mapboxgl.FullscreenControl());
    map.addControl(new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true
      },
      trackUserLocation: true
    }));
  }
  // Minutos sin reportar a partir de los cuales consideramos que la estación
  // "no está comunicando" (mismo umbral que ya usa Home para datos desactualizados).
  private readonly MINUTOS_SIN_COMUNICACION = 90;

  private estaciones(){
    let i: number;

    for (i = 0; i < this.mensajes.length; i++){
      const temp = Number(this.mensajes[i].temp_af);

      // Filtro de plausibilidad: descarta lecturas de sensor claramente erróneas
      if (!Number.isFinite(temp) || temp <= -30 || temp >= 65) {
        continue;
      }

      this.dia = this.mensajes[i].fecha_I.substr(8, 2);
      this.Mes = this.mensajes[i].fecha_I.substr(5, 2);
      this.anio = this.mensajes[i].fecha_I.substr(0, 4);
      this.hora = this.mensajes[i].fecha_I.substr(11, 5);

      this.color = 'verde.png';

      if (temp < 0){
        this.color = 'azul_claro.png';
      }
      if (temp <= -2){
        this.color = 'azul_medio_1.png';
      }
      if (temp <= -4){
        this.color = 'azul_oscuro.png';
      }
      if (temp >= 30){
        this.color = 'amarillo.png';
      }
      if (temp >= 35){
        this.color = 'naranja.png';
      }
      if (temp >= 40){
        this.color = 'rojo.png';
      }

      const sinComunicacion = this.esStale(this.mensajes[i].fecha_I);
      if (sinComunicacion) {
        this.color = 'gris.png';
      }

      this.properties.push(
        { type: 'Feature',
          geometry:
            { type: 'point',
            coordinates: [ Number(this.mensajes[i].lon) , Number(this.mensajes[i].lat) ]
          },
          properties: {
            estacion: this.mensajes[i].nombre,
            description: this.mensajes[i].nombre,
            temperatura: Math.round(temp),
            color: this.color,
            sinComunicacion,
            fecha: this.dia + '/' + this.Mes + '/' + this.anio + ' · ' + this.hora + ' h',
            iconSize: [20, 20]}
        }
      );
    }
    this.prueba = { type: 'FeatureCollection', features: this.properties };

  }

  private esStale(fechaI: string): boolean {
    if (!fechaI) return true;
    const fecha = new Date(fechaI.replace(' ', 'T'));
    if (isNaN(fecha.getTime())) return true;
    const minutos = (Date.now() - fecha.getTime()) / 60000;
    return minutos > this.MINUTOS_SIN_COMUNICACION;
  }
  private cargaDatosMapa(map){
    this.prueba.features.forEach((marker) => {
      // create a DOM element for the marker
      const el = document.createElement('div');
      el.className = 'marker';

      // ícono
      el.style.backgroundImage = 'url(../../assets/icon/' + marker.properties.color + ')';

      // tamaño
      el.style.backgroundSize = '100%';
      el.style.width = marker.properties.iconSize[0] + 'px';
      el.style.height = marker.properties.iconSize[1] + 'px';

      agregarValor(el, `${marker.properties.temperatura}°`);

      const popup = popupEstacion(
        marker.properties.estacion,
        [
          ['Temperatura', `${marker.properties.temperatura} °C`],
          ['Último registro', marker.properties.fecha],
        ],
        marker.properties.sinComunicacion ? 'Sin comunicación reciente' : undefined
      );

      // agrega el marcador al mapa (al tocarlo abre el popup)
      new mapboxgl.Marker(el)
        .setLngLat(marker.geometry.coordinates)
        .setPopup(popup)
        .addTo(map);
    });
  }
  cargarImagen(){
    this.imagen = '../../assets/fondos/mapa-temperatura.jpg';
    this.mapas = '../../assets/tab-icons/btnMapas.png';
  }
}
