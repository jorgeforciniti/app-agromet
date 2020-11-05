import { Component, DoCheck } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss']
})

export class HomePage implements DoCheck{

  dato: any;
  message: any;
  dia: string;
  nombreMes: string;
  anio: string;
  hora: string;
  diaSemana: string;
  mensajes: any[] = [];
  imagen: string;
  ubicacion: string;

  constructor( private router: Router ) {
    this.cargarDatos();
  }

  ngDoCheck() {
    this.cargarDatos();
    this.cargarImagen();
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
    this.dato.temp_af = Number( this.dato.temp_af);
    this.dato.hum_af = Math.round(parseInt( this.dato.hum_af, 10));
    this.dato.presion = Math.round(parseInt( this.dato.presion, 10));
    this.dato.RR_dia = Math.round(parseInt( this.dato.RR_dia, 10));
    this.dato.rr_15 = parseFloat( this.dato.rr_15);
    this.dato.viento_max = Math.round(parseInt( this.dato.viento_max, 10));
  }

  onClick(){
    this.cargarDatos();
    this.router.navigate(['/localidades']);
  }
  cargarImagen(){
    if(this.dato.temp_af<30){
      if(this.dato.temp_af<0){
        this.imagen = '../../assets/fondos/inicio-heladas.jpg';
      }else{
        this.imagen = '../../assets/fondos/inicio-soleado.jpg';
      }
    }else{
      this.imagen = '../../assets/fondos/inicio-temperatura-alta.jpg';
    }
    if(this.dato.RR_dia > 1){
      this.imagen = '../../assets/fondos/inicio-rr.jpg';
    }
    this.ubicacion = '../../assets/wheater-icons/ubicacion.png';
  }
}
