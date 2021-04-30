import { Component, OnInit } from '@angular/core';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { Router } from '@angular/router';
import swal from 'sweetalert2';
import { LoadingController } from '@ionic/angular';

declare var mapboxgl: any;
@Component({
  selector: 'app-mapaheladas',
  templateUrl: './mapaheladas.page.html',
  styleUrls: ['./mapaheladas.page.scss'],
})
export class MapaheladasPage implements OnInit {

      private mensajes: any[] = [];
      private properties: any[] = [];
      private prueba: any;
      private color: string;
      private temp: number;
      tipoT: string;
  imagen: string;
  mapas: string;
      constructor(private datosTemperaturas: EstacionesService, private router: Router, public loadingCtrl: LoadingController) { }

      ngOnInit() {
        this.traeHeladas(0);
        this.cargarImagen();
      }

      async traeHeladas(heladas){
        const loading = await this.loadingCtrl.create({
          spinner: 'bubbles',
          translucent: true,
          cssClass: 'custom-class custom-loading',
          showBackdrop: false,
          message: 'Espere por favor...',
        });
        await loading.present();

        if (heladas === 0){
          this.tipoT = 'de hoy';
          this.datosTemperaturas.getHelDia()
          // tslint:disable-next-line: deprecation
          .subscribe( (posts: any[]) => {
            this.mensajes = posts;
            this.mostrarMapa(heladas);
            loading.dismiss();
          });
        }else if (heladas === 1){
          this.tipoT = 'del mes';
          this.datosTemperaturas.getHelMes()
          // tslint:disable-next-line: deprecation
          .subscribe( (posts: any[]) => {
            this.mensajes = posts;
            this.mostrarMapa(heladas);
            loading.dismiss();
          });
        }else{
          this.tipoT = 'del año';
          this.datosTemperaturas.getHelAnio()
          // tslint:disable-next-line: deprecation
          .subscribe( (posts: any[]) => {
            this.mensajes = posts;
            this.mostrarMapa(heladas);
            loading.dismiss();
          });
        }
      }

      mostrarMapa(heladas){
        mapboxgl.accessToken = 'pk.eyJ1Ijoiam9yZ2Vmb3JjaW5pdGkiLCJhIjoiY2tkMXJmaG51MGljODMxcnlybW1uaWFhMSJ9.r5sRXgwgOL-34LRNjx0Mzg';
        const mapHoy = new mapboxgl.Map({
          container: 'mapa',
          style: 'mapbox://styles/mapbox/satellite-streets-v11',
          center: [-65.3, -27.2],
          zoom: 7.1
          });

        this.controlesHoy(mapHoy);

        this.estacionesHel();

        this.cargaDatosMapa(mapHoy, heladas);

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
      private estacionesHel(){
        let i: number;
        for (i = 0; i < this.mensajes.length; i++){
          this.temp = Number(this.mensajes[i].temperatura);
          if (this.mensajes[i].fph != null){
          this.mensajes[i].fph = this.mensajes[i].fph.substr(8, 2) + '-'
          + this.mensajes[i].fph.substr(5, 2) + '-'
          + this.mensajes[i].fph.substr(0, 4);

          this.mensajes[i].fuh = this.mensajes[i].fuh.substr(8, 2) + '-'
          + this.mensajes[i].fuh.substr(5, 2) + '-'
          + this.mensajes[i].fuh.substr(0, 4);

          this.color = 'none.png';
          // tslint:disable-next-line: max-line-length
          if (this.temp < 0){
            this.color = 'amarillo_brush.png';
          }
          if (this.temp <= -2){
            this.color = 'naranja_claro_brush.png';
          }
          if (this.temp <= -4){
            this.color = 'naranja_oscuro_brush.png';
          }
          if (this.temp <= -6){
            this.color = 'rojo_brush.png';
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
                temperatura: this.temp,
                duracion: this.mensajes[i].duracion,
                registros: this.mensajes[i].registros,
                dias: this.mensajes[i].dias,
                fph: this.mensajes[i].fph,
                fuh: this.mensajes[i].fuh,
                duracion_t: this.mensajes[i].duracion_t,
                color: this.color,
                iconSize: [35, 35]}
            }
          );
        }
        }
        this.prueba = { type: 'FeatureCollection', features: this.properties };

      }
      private cargaDatosMapa(mapa, heladas){
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
          if (heladas === 0){
            el.addEventListener('click', () => {
             swal.fire({title: marker.properties.estacion,
              html: ` Intensidad: <strong>${marker.properties.temperatura}ºC</strong><br>Duración: <strong>${marker.properties.duracion}hs</strong>`}
              );
            });
        }else{
          el.addEventListener('click', () => {
            swal.fire({title: marker.properties.estacion,
             html: ' Intensidad: <strong>' + marker.properties.temperatura + 'ºC</strong><br>'
             + 'Durac. máxima: <strong>' + marker.properties.duracion + 'hs</strong><br>'
             + 'Durac. total: <strong>' + marker.properties.duracion_t + 'hs</strong><br>'
             + 'Días con heladas: <strong>' + marker.properties.dias + '</strong><br>'
             + 'FPH: <strong>' + marker.properties.fph + '</strong><br>'
             + 'FUH: <strong>' + marker.properties.fuh + '</strong><br>'
             + 'Registros: <strong>' + marker.properties.registros + '</strong>'}
             );
         });
        }

          // agrega el marcador al mapa
          new mapboxgl.Marker(el)
            .setLngLat(marker.geometry.coordinates)
            .addTo(mapa);
        });
      }
      cargarImagen(){
        this.imagen = '../../assets/fondos/inicio-heladas.jpg';
        this.mapas = '../../assets/tab-icons/btnMapas.png';
      }
    }
