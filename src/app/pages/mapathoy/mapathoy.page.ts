import { Component, OnInit } from '@angular/core';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { Router } from '@angular/router';
import swal from 'sweetalert2';
import { LoadingController } from '@ionic/angular';

declare var mapboxgl: any;
@Component({
  selector: 'app-mapathoy',
  templateUrl: './mapathoy.page.html',
  styleUrls: ['./mapathoy.page.scss'],
})
export class MapathoyPage implements OnInit {

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
      .subscribe( (posts: any[]) => {
        this.mensajes = posts;
        this.mostrarMapa();
        loading.dismiss();
      });
    }else{
      this.tipoT = 'mínimas';
      this.datosTemperaturas.getTempMin()
      .subscribe( (posts: any[]) => {
        this.mensajes = posts;
        this.mostrarMapa();
        loading.dismiss();
      });
    }
  }

  mostrarMapa(){
    mapboxgl.accessToken = 'pk.eyJ1Ijoiam9yZ2Vmb3JjaW5pdGkiLCJhIjoiY2tkMXJmaG51MGljODMxcnlybW1uaWFhMSJ9.r5sRXgwgOL-34LRNjx0Mzg';
    const mapHoy = new mapboxgl.Map({
      container: 'mapa',
      style: 'mapbox://styles/mapbox/satellite-streets-v11',
      center: [-65.3, -27.2],
      zoom: 7.1
      });

    this.controlesHoy(mapHoy);

    this.estacionesMax();

    this.cargaDatosMapaHoy(mapHoy);

    mapHoy.on('load', () => {

      // ********************************************************************
        mapHoy.addSource('tucuman', {
          type: 'geojson',
          data: '../../assets/icon/limites.geojson'
        });
        mapHoy.addLayer({
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
        mapHoy.resize();
      }
    );
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
      el.addEventListener('click', () => {
         swal.fire({title: '<strong>' + marker.properties.estacion + '</strong>',
         html: 'Temperatura ' + tipoTsinS + ': <strong>' + marker.properties.temperatura + 'ºC</strong>' });
      });

      // agrega el marcador al mapa
      new mapboxgl.Marker(el)
        .setLngLat(marker.geometry.coordinates)
        .addTo(mapa);
    });
  }
  cargarImagen(){
    this.imagen = '../../assets/fondos/mapa-temperatura.jpg';
    this.mapas = '../../assets/tab-icons/btnMapas.png';
  }
}
