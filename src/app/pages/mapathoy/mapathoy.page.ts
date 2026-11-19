import { Component, OnInit, OnChanges, SimpleChanges, Input } from '@angular/core';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { Router } from '@angular/router';
import { LoadingController } from '@ionic/angular';
import { agregarValor, mostrarValoresSegunZoom, popupEstacion } from 'src/app/shared/marcador-mapa';
import { decimal } from 'src/app/shared/formato';
import { environment } from 'src/environments/environment';
import { OwmLayerKey, setOwmLayer, capaNecesitaEstiloCalles, esperarEstiloListo, esperarMapaIdle } from 'src/app/shared/owm-weather-layer.util';

declare var mapboxgl: any;
@Component({
  selector: 'app-mapathoy',
  templateUrl: './mapathoy.page.html',
  styleUrls: ['./mapathoy.page.scss'],
})
export class MapathoyPage implements OnInit, OnChanges {
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
  private temp: number;
  tipoT: string;
  dato: any;
  imagen: string;
  mapas: string;
  constructor(private datosTemperaturas: EstacionesService, private router: Router, public loadingCtrl: LoadingController) { }

  ngOnInit() {
    this.traeTemperaturas(true);
    this.cargarImagen();
  }

  /** El segmento también avisa cuando cambia su valor desde el código: sólo se recarga si el usuario lo cambió */
  cambiarTipo(valor: string) {
    if (valor && valor !== this.tipoT) this.traeTemperaturas(valor === 'máximas');
  }

  async traeTemperaturas(maximas){
    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Espere por favor...',
    });
    await loading.present();

    if (maximas){
      this.tipoT = 'máximas';
      this.datosTemperaturas.getTempMax()
      // tslint:disable-next-line: deprecation
      .subscribe( (posts: any[]) => {
        this.mensajes = posts;
        this.mostrarMapa();
        loading.dismiss();
      });
    }else{
      this.tipoT = 'mínimas';
      this.datosTemperaturas.getTempMin()
      // tslint:disable-next-line: deprecation
      .subscribe( (posts: any[]) => {
        this.mensajes = posts;
        this.mostrarMapa();
        loading.dismiss();
      });
    }
  }

  mostrarMapa(){
    mapboxgl.accessToken = environment.mapboxAccessToken;
    // Al pasar de máximas a mínimas se crea otro mapa en el mismo contenedor: sin esto quedaban los
    // puntos del anterior debajo (dos por estación)
    if (this.map) {
      this.map.remove();
    }
    const mapHoy = new mapboxgl.Map({
      container: 'mapa',
      style: 'mapbox://styles/mapbox/satellite-streets-v11',
      center: [-65.3, -27.2],
      zoom: 7.1
      });

    this.map = mapHoy;
    this.estiloEsCalles = false; // el mapa nuevo siempre arranca en estilo satelital
    this.cambiandoEstilo = false;

    this.controlesHoy(mapHoy);

    this.estacionesMax();

    this.cargaDatosMapaHoy(mapHoy);
    mostrarValoresSegunZoom(mapHoy);

    mapHoy.on('load', () => {
      this.agregarContornoTucuman();
      this.aplicarCapaClima();

      mapHoy.resize();
      }
    );
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.capaClima && this.map) {
      this.aplicarCapaClima();
    }
  }

  /** Solo el contorno de la provincia, sin relleno (consistente con el resto de los mapas). */
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

  private controlesHoy(mapa: any) {
    mapa.addControl(new mapboxgl.NavigationControl());
    mapa.addControl(new mapboxgl.FullscreenControl());
    mapa.addControl(new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true
      },
      trackUserLocation: true
    }));
  }
  private estacionesMax(){
    let i: number;
    this.properties = [];
    for (i = 0; i < this.mensajes.length; i++){
      this.temp = Number(this.mensajes[i].temperatura);
      this.color = 'verde.png';
      // tslint:disable-next-line: max-line-length
      if (this.temp < 0){
        this.color = 'azul_claro.png';
      }
      if (this.temp <= -2){
        this.color = 'azul_medio_1.png';
      }
      if (this.temp <= -4){
        this.color = 'azul_oscuro.png';
      }
      if (this.temp >= 30){
        this.color = 'amarillo.png';
      }
      if (this.temp >= 35){
        this.color = 'naranja.png';
      }
      if (this.temp >= 40){
        this.color = 'rojo.png';
      }

      if (this.temp > -20 && this.temp < 60){

        this.properties.push(
          { type: 'Feature',
            geometry:
              { type: 'point',
                coordinates: [ Number(this.mensajes[i].lon) , Number(this.mensajes[i].lat) ]
              },
            properties: {
              estacion: this.mensajes[i].nombre,
              description: this.mensajes[i].nombre,
              temperatura: this.temp,
              color: this.color,
              iconSize: [20, 20]
            }
          }
        );
      }
    }
    this.prueba = { type: 'FeatureCollection', features: this.properties };

  }
  private cargaDatosMapaHoy(mapa){
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

      // espera el click
      let tipoTsinS = '';
      if (this.tipoT === 'máximas'){
        tipoTsinS = 'máxima';
      }else {
        tipoTsinS = 'mínima';
      }
      const t = Number(marker.properties.temperatura);
      agregarValor(el, `${Math.round(t)}°`);

      const popup = popupEstacion(marker.properties.estacion, [
        [`Temperatura ${tipoTsinS} de hoy`, `${decimal(t, 1)} °C`],
      ]);

      // agrega el marcador al mapa (al tocarlo abre el popup)
      new mapboxgl.Marker(el)
        .setLngLat(marker.geometry.coordinates)
        .setPopup(popup)
        .addTo(mapa);
    });
  }
  cargarImagen(){
    this.imagen = '../../assets/fondos/mapa-temperatura.jpg';
    this.mapas = '../../assets/tab-icons/btnMapas.png';
  }
}
