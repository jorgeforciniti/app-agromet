import { Component, OnInit, AfterViewInit } from '@angular/core';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { Router } from '@angular/router';
import swal from 'sweetalert2';

declare var mapboxgl: any;
@Component({
  selector: 'app-mapat',
  templateUrl: './mapat.page.html',
  styleUrls: ['./mapat.page.scss'],
})
export class MapatPage implements OnInit, AfterViewInit {
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
    this.mensajes = JSON.parse(localStorage.getItem('estaciones'));
    this.cargarImagen();
  }

  ngAfterViewInit(){
    mapboxgl.accessToken = 'pk.eyJ1Ijoiam9yZ2Vmb3JjaW5pdGkiLCJhIjoiY2tkMXJmaG51MGljODMxcnlybW1uaWFhMSJ9.r5sRXgwgOL-34LRNjx0Mzg';
    const map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/satellite-streets-v11',
      center: [-65.3, -26.91],
      zoom: 7.1
      });

    this.controles(map);

    this.estaciones();

    this.cargaDatosMapa(map);

    map.on('load', () => {

      // ********************************************************************
      map.addSource('tucuman', {
        type: 'geojson',
        data: '../../assets/icon/limites.geojson'
      });
      map.addLayer({
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

      map.resize();
      }
    );
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
  private estaciones(){
    let i: number;

    for (i = 0; i < this.mensajes.length; i++){

      this.dia = this.mensajes[i].fecha_I.substr(8, 2);
      this.Mes = this.mensajes[i].fecha_I.substr(5, 2);
      this.anio = this.mensajes[i].fecha_I.substr(0, 4);
      this.hora = this.mensajes[i].fecha_I.substr(11, 5);

      this.color = 'verde.png';

      if (this.mensajes[i].temp_af < 0){
        this.color = 'azul_claro.png';
      }
      if (this.mensajes[i].temp_af <= -2){
        this.color = 'azul_medio_1.png';
      }
      if (this.mensajes[i].temp_af <= -4){
        this.color = 'azul_oscuro.png';
      }
      if (this.mensajes[i].temp_af >= 30){
        this.color = 'amarillo.png';
      }
      if (this.mensajes[i].temp_af >= 35){
        this.color = 'naranja.png';
      }
      if (this.mensajes[i].temp_af >= 40){
        this.color = 'rojo.png';
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
            temperatura: Math.round(parseInt( this.mensajes[i].temp_af, 10)),
            color: this.color,
            fecha: this.dia + '/' + this.Mes + '/' + this.anio + ', ' + this.hora + ' horas',
            iconSize: [20, 20]}
        }
      );
    }
    this.prueba = { type: 'FeatureCollection', features: this.properties };

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

      // espera el click
      el.addEventListener('click', () => {
        swal.fire({title: marker.properties.estacion ,
           html: 'Temperatura: <strong>' + marker.properties.temperatura +
        'ºC </strong><br><br>' + 'Ultimo registro: <br><strong>' + marker.properties.fecha + '</strong>'});
      });

      // agrega el marcador al mapa
      new mapboxgl.Marker(el)
        .setLngLat(marker.geometry.coordinates)
        .addTo(map);
    });
  }
  cargarImagen(){
    this.imagen = '../../assets/fondos/mapa-temperatura.jpg';
    this.mapas = '../../assets/tab-icons/btnMapas.png';
  }
}
