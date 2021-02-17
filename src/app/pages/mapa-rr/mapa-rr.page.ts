import { Component, OnInit } from '@angular/core';
import { EstacionesService } from 'src/app/services/estaciones.service';
import swal from 'sweetalert2';
import { LoadingController } from '@ionic/angular';

declare var mapboxgl: any;
@Component({
  selector: 'app-mapa-rr',
  templateUrl: './mapa-rr.page.html',
  styleUrls: ['./mapa-rr.page.scss'],
})
export class MapaRRPage implements OnInit {

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
    .subscribe( (posts: any[]) => {
      this.mensajes = posts;
      this.mostrarMapa();
      loading.dismiss();
    });
  }

  mostrarMapa(){
    mapboxgl.accessToken = 'pk.eyJ1Ijoiam9yZ2Vmb3JjaW5pdGkiLCJhIjoiY2tkMXJmaG51MGljODMxcnlybW1uaWFhMSJ9.r5sRXgwgOL-34LRNjx0Mzg';
    const maprr = new mapboxgl.Map({
      container: 'maprr',
      style: 'mapbox://styles/mapbox/satellite-streets-v11',
      center: [-65.3, -27.2],
      zoom: 7.1
      });

    this.controles(maprr);

    this.estaciones();

    this.cargaDatosMapa(maprr);

    maprr.on('load', () => {

      // ********************************************************************
        maprr.addSource('tucuman', {
          type: 'geojson',
          data: '../../assets/icon/limites.geojson'
        });
        maprr.addLayer({
          id: 'fulfillment-polygon',
          type: 'fill',
          source: 'tucuman',
          paint: {
            'fill-color': '#888888',
            'fill-opacity': 0.5
          },
          filter: ['==', '$type', 'Polygon']
        });
      // ********************************************************************
        maprr.resize();
      }
    );
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
            iconSize: [20+(this.rr/3.5), 20+(this.rr/3.5)]}
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
      el.addEventListener('click', () => {
         swal.fire({title: marker.properties.estacion,
          html: ' Lluvia: <strong>' + marker.properties.temperatura + ' mm <strong>'});
      });

      // agrega el marcador al mapa
      new mapboxgl.Marker(el)
        .setLngLat(marker.geometry.coordinates)
        .addTo(mapa);
    });
  }
  cargarImagen(){
    this.imagen = '../../assets/fondos/mapa-rr.jpg';
    this.mapas = '../../assets/tab-icons/btnMapas.png';
  }
}