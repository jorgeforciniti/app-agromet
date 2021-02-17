import { Component, DoCheck, OnInit } from '@angular/core';
import {NavController} from '@ionic/angular';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { Router } from '@angular/router';
import { LoadingController } from '@ionic/angular';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss']
})

export class HomePage implements DoCheck, OnInit{

  dato: any;
  message: any;
  dia: string;
  semana: any [] = [];
  nombreMes: string;
  anio: string;
  hora: string;
  diaSemana: string;
  mensajes: any= {};
  imagen: string;
  ubicacion: string;
  icono: String;

  constructor( private pronostico: EstacionesService, 
    private router: Router, 
    public loadingCtrl: LoadingController, 
    public navCtrl: NavController ) {
    this.cargarDatos();
    this.cargarImagen();
  }

  ngOnInit() {
  }

  ngDoCheck() {
    if (localStorage.getItem('home') === '1'){
      setTimeout(
        () => {
          localStorage.setItem('home', '1');
          localStorage.setItem('temperatura', '1');
          localStorage.setItem('lluvia', '1');
          localStorage.setItem('helada', '1');
          console.log("actualizando");
          this.router.navigate(['/home']);
        }, 600000
      );
      this.cargarDatos();
      this.cargarImagen();
      this.traerPronostico();
      localStorage.setItem('home', '0');
    }    
  }

  refrescar(event){
    localStorage.setItem('home', '1');
    localStorage.setItem('temperatura', '1');
    localStorage.setItem('lluvia', '1');
    localStorage.setItem('helada', '1');
    console.log("refrescando");
    setTimeout(() => {
      console.log('Async operation has ended');
      event.target.complete();
    }, 2000);
   }

  cargarDatos(){
    this.semana = []
    this.dato = JSON.parse(localStorage.getItem('datos'));
    this.dia = this.dato.fecha_I.substr(8, 2);
    const mes = this.dato.fecha_I.substr(5, 2);
    this.anio = this.dato.fecha_I.substr(0, 4);
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    const diasCortos = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const dt = new Date(mes + ' ' + this.dia + ', ' + this.anio);
    this.diaSemana = dias[dt.getUTCDay()];
    this.nombreMes = meses[parseInt(mes, 10) - 1];

    for (let i = dt.getUTCDay()+1; i < dt.getUTCDay() + 8; i++) {
      if (i>6){
        this.semana.push(diasCortos[i-7]);
      } else{
        this.semana.push(diasCortos[i]);
      }
    } 

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

  uv=0;
  iconosD: any [] = [];
  maximasD: any [] = [];
  minimasD: any [] = [];
  datosH: any [] = [];
  alertas: any [] = [];
  

  async traerPronostico(){
    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Cargando pronósticos...',
    });
    await loading.present();

    console.log("pidiendo pronostico");
    this.pronostico.getPronostico()
    .subscribe( (posts: any[]) => {
      this.mensajes = posts;

      console.log(this.mensajes);
      this.icono="../../assets/w-icons/"+ this.mensajes.current.weather[0].icon+".png";
      this.uv = this.mensajes.current.uvi.toFixed(0);
      
      this.iconosD = [];
      this.maximasD = [];
      this.minimasD = [];
          for (let i = 1; i < 8; i++) {
        this.iconosD.push("../../assets/w-icons/"+ this.mensajes.daily[i].weather[0].icon+".png");
        this.maximasD.push(this.mensajes.daily[i].temp.max.toFixed(0));
        this.minimasD.push(this.mensajes.daily[i].temp.min.toFixed(0));
      }
      let ban=0;
      let x = 0;
      this.datosH = []

      for (let i = 1; i < this.mensajes.hourly.length; i++) {
        if (ban===0){
          if ( new Date(this.mensajes.hourly[i].dt * 1000).getHours() != 0){
            if (x === 2){
              this.datosH.push([new Date(this.mensajes.hourly[i].dt * 1000).getHours()+ ":00","../../assets/w-icons/"+ this.mensajes.hourly[i].weather[0].icon+".png", this.mensajes.hourly[i].temp.toFixed(0), this.mensajes.hourly[i].humidity.toFixed(0), (this.mensajes.hourly[i].wind_speed*3.6).toFixed(0)]);
              x = 0;
            } else {
              x++;
            }
          }else{
            ban=1;
          }
        }
      }

      this.alertas = [];
      this.alertas = this.mensajes.alerts;

      if (this.alertas === undefined){
        this.alertas = [];
        this.alertas.push({"description":"No hay alertas meteorológicas"})
      }

      console.log("pronostico recibido");
      loading.dismiss();
    });
  }  
}
