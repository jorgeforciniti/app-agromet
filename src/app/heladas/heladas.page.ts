import { Component, DoCheck } from '@angular/core';
import { Router } from '@angular/router';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { LoadingController } from '@ionic/angular';

@Component({
  selector: 'app-heladas',
  templateUrl: './heladas.page.html',
  styleUrls: ['./heladas.page.scss'],
})
export class HeladasPage implements DoCheck {
  dato: any;
  dia: string;
  nombreMes: string;
  anio: string;
  hora: string;
  diaSemana: string;
  mensajes: any[] = [];
   tMin = 0;
   tMinMin = 0;

  constructor( private datosTemperaturas: EstacionesService, private router: Router, public loadingCtrl: LoadingController) {
    this.cargarDatos();
  }

  ngDoCheck() {
    if (localStorage.getItem('helada') === '1'){
      this.cargarDatos();
      this.traerHeladas(0);
      localStorage.setItem('helada', '0');
    }
  }

  cargarDatos(){
    this.dato = JSON.parse(localStorage.getItem('datos'));
    this.dia = this.dato.fecha_I.substr(8, 2);
    const mes = this.dato.fecha_I.substr(5, 2);
    this.anio = this.dato.fecha_I.substr(0, 4);
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const dt = new Date(mes + ' ' + this.dia + ', ' + this.anio);
    this.diaSemana = dias[dt.getUTCDay()];
    this.nombreMes = meses[parseInt(mes, 10) - 1];

    // tslint:disable-next-line: max-line-length
    this.hora = this.dato.fecha_I.substr(11, 5);
    this.dato.temp_af = Number(this.dato.temp_af);
  }

  async traerHeladas(heladas){
    heladas = Number(heladas);
    this.tMinMin = 999;

    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Espere por favor...',
    });
    await loading.present();

    if (heladas === 0){
      this.datosTemperaturas.getHelDia()
      .subscribe( (posts: any[]) => {
        this.mensajes = posts;
        this.tMin = this.mensajes.find(estacion => estacion.identificacion === localStorage.getItem('estacion')).temperatura;
        this.tMin = Number(this.tMin);
        let i: number;
        for (i = 0; i < this.mensajes.length; i++){
          if (this.mensajes[i].fph != null){
            this.mensajes[i].fph = this.mensajes[i].fph.substr(8, 2) + '-'
              + this.mensajes[i].fph.substr(5, 2);

            this.mensajes[i].fuh = this.mensajes[i].fuh.substr(8, 2) + '-'
              + this.mensajes[i].fuh.substr(5, 2);
          }
          if (this.tMinMin > this.mensajes[i].temperatura){
            this.tMinMin = this.mensajes[i].temperatura;
          }
          this.mensajes[i].temperatura = Number(this.mensajes[i].temperatura);
        }
        loading.dismiss();
      });
    }else if (heladas === 1){
      this.datosTemperaturas.getHelMes()
      .subscribe( (posts: any[]) => {
        this.mensajes = posts;
        let i: number;
        for (i = 0; i < this.mensajes.length; i++){
          if (this.mensajes[i].fph != null){
            this.mensajes[i].fph = this.mensajes[i].fph.substr(8, 2) + '-'
              + this.mensajes[i].fph.substr(5, 2);

            this.mensajes[i].fuh = this.mensajes[i].fuh.substr(8, 2) + '-'
              + this.mensajes[i].fuh.substr(5, 2);
          }
          if (this.tMinMin > this.mensajes[i].temperatura){
            this.tMinMin = this.mensajes[i].temperatura;
          }
          this.mensajes[i].temperatura = Number(this.mensajes[i].temperatura);
        }
        loading.dismiss();
      });
    }else{
      this.datosTemperaturas.getHelAnio()
      .subscribe( (posts: any[]) => {
        this.mensajes = posts;
        let i: number;
        for (i = 0; i < this.mensajes.length; i++){
          if (this.mensajes[i].fph != null){
            this.mensajes[i].fph = this.mensajes[i].fph.substr(8, 2) + '-'
              + this.mensajes[i].fph.substr(5, 2);

            this.mensajes[i].fuh = this.mensajes[i].fuh.substr(8, 2) + '-'
              + this.mensajes[i].fuh.substr(5, 2);
          }
          if (this.tMinMin > this.mensajes[i].temperatura){
            this.tMinMin = this.mensajes[i].temperatura;
          }
          this.mensajes[i].temperatura = Number(this.mensajes[i].temperatura);
        }
        loading.dismiss();
      });
    }
  }

  onClickHoy(){
    this.router.navigate(['tabs/mapaheladas']);
  }
}
