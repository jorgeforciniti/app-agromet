import { Component, OnInit, OnChanges, SimpleChanges, Input } from '@angular/core';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { LoadingController } from '@ionic/angular';
import { agregarValor, mostrarValoresSegunZoom, popupEstacion } from 'src/app/shared/marcador-mapa';
import { decimal } from 'src/app/shared/formato';
import { environment } from 'src/environments/environment';
import { OwmLayerKey, setOwmLayer, capaNecesitaEstiloCalles, esperarEstiloListo, esperarMapaIdle } from 'src/app/shared/owm-weather-layer.util';

declare var mapboxgl: any;
@Component({
  selector: 'app-mapa-rr',
  templateUrl: './mapa-rr.page.html',
  styleUrls: ['./mapa-rr.page.scss'],
})
export class MapaRRPage implements OnInit, OnChanges {
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
  private rr: number;
  imagen: string;
  mapas: string;

  constructor(private datosTemperaturas: EstacionesService, public loadingCtrl: LoadingController) { }

  ngOnInit() {
    this.traeLluvias();
    this.cargarImagen();
  }

  async traeLluvias(){
    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Espere por favor...',
    });
    await loading.present();

    this.datosTemperaturas.getRR24()
    // tslint:disable-next-line: deprecation
    .subscribe( (posts: any[]) => {
      this.mensajes = posts;
      this.mostrarMapa();
      loading.dismiss();
    });
  }

  mostrarMapa(){
    mapboxgl.accessToken = environment.mapboxAccessToken;
    const maprr = new mapboxgl.Map({
      container: 'maprr',
      style: 'mapbox://styles/mapbox/satellite-streets-v11',
      center: [-65.3, -27.2],
      zoom: 7.1
      });

    this.map = maprr;
    this.estiloEsCalles = false;

    this.controles(maprr);

    this.estaciones();

    this.cargaDatosMapa(maprr);
    mostrarValoresSegunZoom(maprr);

    maprr.on('load', () => {
      this.agregarContornoTucuman();
      this.aplicarCapaClima();

      maprr.resize();
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

  private controles(mapa: any) {
    mapa.addControl(new mapboxgl.NavigationControl());
    mapa.addControl(new mapboxgl.FullscreenControl());
    mapa.addControl(new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true
      },
      trackUserLocation: true
    }));
  }

  private estaciones(){
    let i: number;

    for (i = 0; i < this.mensajes.length; i++){
      this.rr = Number(this.mensajes[i].lluvia);

      this.color = 'gris_negro.png';

      if (this.rr === 0){
        this.color = 'gris_negro.png';
      }
      if (this.rr > 0){
        this.color = 'verde_amarillo.png';
      }
      if (this.rr > 0.5){
        this.color = 'azul_claro.png';
      }
      if (this.rr > 10){
        this.color = 'azul_medio_1.png';
      }
      if (this.rr > 50){
        this.color = 'azul_oscuro.png';
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
            temperatura: this.rr,
            color: this.color,
            iconSize: [20 + (this.rr / 3.5), 20 + (this.rr / 3.5)]}
        }
      );
    }
    this.prueba = { type: 'FeatureCollection', features: this.properties };
  }

  private cargaDatosMapa(mapa){
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
      // properties.temperatura guarda acá la lluvia (mm)
      const rr = Number(marker.properties.temperatura);
      const rrTexto = Number.isFinite(rr) ? `${decimal(rr, rr % 1 ? 1 : 0)} mm` : 'S/D';
      if (rr > 0) agregarValor(el, rrTexto);

      const popup = popupEstacion(marker.properties.estacion, [['Lluvia últimas 24 h', rrTexto]]);

      // agrega el marcador al mapa (al tocarlo abre el popup)
      new mapboxgl.Marker(el)
        .setLngLat(marker.geometry.coordinates)
        .setPopup(popup)
        .addTo(mapa);
    });
  }
  cargarImagen(){
    this.imagen = '../../assets/fondos/mapa-rr.jpg';
    this.mapas = '../../assets/tab-icons/btnMapas.png';
  }
}
