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
  mensajes: any = {};
  msj: any = {};
  imagen: string;
  ubicacion: string;
  icono: string;
  uv = "";
  iconosD: any [] = [];
  maximasD: any [] = [];
  minimasD: any [] = [];
  datosH: any [] = [];
  alertas: any [] = [];
  loading: number;

  constructor(
    private pronostico: EstacionesService,
    private router: Router,
    public loadingCtrl: LoadingController,
    public navCtrl: NavController ) {
  }

  ngOnInit() {
    this.loading = 0;
    localStorage.setItem('home', '1');
    this.traeDatosDeAPI();
    setTimeout(
      () => {
        console.log('actualizar');
        localStorage.setItem('home', '1');
        this.router.navigate(['/home']);
      }, 600000
    );
  }

  ngDoCheck() {
    if (localStorage.getItem('home') === '1'){
      console.log('cambiando');
      this.cargarDatos();
      this.cargarImagen();
      this.traerPronostico();
      localStorage.setItem('home', '0');
    }
  }

  async traeDatosDeAPI(){
    console.log('trae datos desde home ****');
    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Espere por favor...',
    });
    await loading.present();

    this.pronostico.getDatos()
    // tslint:disable-next-line: deprecation
    .subscribe( (posts: any[]) => {
      localStorage.setItem('datos', JSON.stringify(posts));
      loading.dismiss();
//      this.cargarDatos();
      localStorage.setItem('home', '0');
    });

  }

  refrescar(event){
    this.banderas('1');
    console.log('refrescando');
    setTimeout(() => {
      console.log('Async operation has ended');
      event.target.complete();
    }, 2000);
   }

  cargarDatos(){
    this.semana = [];
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

    for (let i = dt.getUTCDay() + 1; i < dt.getUTCDay() + 8; i++) {
      if (i > 6){
        this.semana.push(diasCortos[i - 7]);
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
    console.log('cargando Datos...');
  }

  onClick(){
    this.cargarDatos();
    this.router.navigate(['/localidades']);
  }
  cargarImagen(){
    if (this.dato.temp_af < 30){
      if (this.dato.temp_af < 0){
        this.imagen = '../../assets/fondos/inicio-heladas.jpg';
      }else{
        this.imagen = '../../assets/fondos/inicio-soleado.jpg';
      }
    }else{
      this.imagen = '../../assets/fondos/inicio-temperatura-alta.jpg';
    }
    if (this.dato.RR_dia > 1){
      this.imagen = '../../assets/fondos/inicio-rr.jpg';
    }
    this.ubicacion = '../../assets/wheater-icons/ubicacion.png';
  }

  async traerPronostico(){
    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Cargando pronósticos...',
    });
    await loading.present();

    console.log('pidiendo pronostico ****');

    this.pronostico.getClimaActual()
    // tslint:disable-next-line: deprecation
    .subscribe( (postsC: any[]) => {
      this.msj = postsC;
      this.icono = '../../assets/w-icons/' + this.msj.weather[0].icon + '.png';      
    });

    this.pronostico.getPronostico()
    // tslint:disable-next-line: deprecation
    .subscribe( (posts: any[]) => {
      this.mensajes = posts;

//      this.uv = this.mensajes.current.uvi.toFixed(0);
      this.uv = "";

      let ban = 0, fecha = 0;
      let fechaDia;
      this.datosH = [];

      for (let i = 1; i < this.mensajes.cnt; i++) {
        fecha=new Date(this.mensajes.list[i].dt * 1000).getDate();
        fechaDia=new Date(this.mensajes.list[i].dt * 1000);

        let utcDay = fechaDia.getUTCDate(); // Día (UTC)
        let utcMonth = fechaDia.getUTCMonth() + 1; // Mes (UTC) - recuerda que los meses en JavaScript son 0-11
        let utcYear = fechaDia.getUTCFullYear(); // Año (UTC)
        
        // Formatear la fecha en formato dd/mm/yyyy
        let formattedDate = `${utcDay.toString().padStart(2, '0')}/${utcMonth.toString().padStart(2, '0')}/${utcYear}`;
                
        if (ban != fecha){
          ban=fecha
          this.datosH.push([
            formattedDate,
            0,
            0,
            0,
            0,
            0
        ]);
    }
          this.datosH.push([
                0,
                new Date(this.mensajes.list[i].dt * 1000).getHours() + ':00',
                '../../assets/w-icons/' + this.mensajes.list[i].weather[0].icon + '.png',
                this.mensajes.list[i].main.temp.toFixed(0),
                this.mensajes.list[i].main.humidity.toFixed(0),
                (this.mensajes.list[i].wind.speed * 3.6).toFixed(0),
                this.mensajes.list[i].weather[0].description
            ]);
      }

      this.alertas = [];
      this.alertas = this.mensajes.alerts;

      if (this.alertas === undefined){
        this.alertas = [];
        this.alertas.push({description: 'No hay alertas meteorológicas'});
      }

      console.log('pronostico recibido');
      loading.dismiss();
    });
  }

  banderas(valor){
    localStorage.setItem('home', valor);
    localStorage.setItem('temperatura', valor);
    localStorage.setItem('lluvia', valor);
    localStorage.setItem('helada', valor);
    }

}
