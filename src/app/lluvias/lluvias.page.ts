import { Component, DoCheck } from '@angular/core';
import { Router } from '@angular/router';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { ChartOptions, ChartType, ChartDataSets } from 'chart.js';
import { Color, Label } from 'ng2-charts';
import { LoadingController } from '@ionic/angular';

@Component({
  selector: 'app-lluvias',
  templateUrl: 'lluvias.page.html',
  styleUrls: ['lluvias.page.scss']
})
export class LluviasPage implements DoCheck{

  dato: any;
  dia: string;
  nombreMes: string;
  anio: string;
  hora: string;
  diaSemana: string;
  mensajes: any[] = [];
  mensajes2: any[] = [];
  mensajes3: any[] = [];
  rrAyer = 0;
  mesesCorto = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  private auxRR: any[] = [];
  private auxD: any[] = [];

  // **************************************************

  public barChartOptions: ChartOptions = {
    responsive: true,
    scales: { xAxes: [{}],
              yAxes: [{
                id: 'y-axis-0',
                position: 'left',
                scaleLabel: {display: true, labelString: 'mm'}
            }]
    }
  };
  public barChartLabels: Label[] = ['', '', '', '', '', '', ''];
  public barChartType: ChartType = 'bar';
  public barChartLegend = false;

  public barChartData: ChartDataSets[] = [
    { data: [0, 0, 0, 0, 0, 0, 0], label: 'lluvia' }
  ];

  public barChartColors: Color[] = [
    { backgroundColor: 'blue' }
  ];

  // **************************************************

 imagen: string;
  ubicacion: string;
  mapas: string;

  // **************************************************

  constructor( private datosLluvias: EstacionesService, private router: Router, public loadingCtrl: LoadingController) {
    this.cargarDatos();
  }

  ngDoCheck() {
    if (localStorage.getItem('lluvia') === '1'){
      this.cargarDatos();
      this.traerRRMes();
      localStorage.setItem('lluvia', '0');
      this.cargarImagen();
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
    this.dato.RR_dia = Number(this.dato.RR_dia);
    this.dato.rr_mes = Number(this.dato.rr_mes);
    this.dato.rr_15 = Number(this.dato.rr_15);
  }

  async traerRRMes(){
    this.auxRR = [];
    this.auxD = [];
    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Espere por favor...',
    });
    await loading.present();

    this.datosLluvias.getRRMes()
    // tslint:disable-next-line: deprecation
    .subscribe( (posts: any[]) => {
      this.mensajes = posts[0];
      this.mensajes2 = posts[1];
      this.mensajes3 = posts[2];
      this.traerRR('1');
      loading.dismiss();
    });
  }

  onClickAhora(){
     this.router.navigate(['tabs/mapa-rr']);
  }

  traerRR(tipoR){
    let i: number;
    this.auxRR = [];
    this.auxD = [];
    const hoy = new Date();
    const mm = hoy.getMonth();
    this.rrAyer = Number(this.mensajes2[this.mensajes2.length - 2].lluvia);

    this.dato.rr_mes = Number(this.mensajes3[ mm ].lluvia);



    if (tipoR === '1'){
      for (i = 0; i < this.mensajes.length; i++){
        if (Number(this.mensajes[i].lluvia) < 500 && this.mensajes[i].lluvia != null){
          this.auxRR.push(Number(this.mensajes[i].lluvia).toFixed(1));
        }else{
          this.auxRR.push(null);
        }
        this.auxD.push(this.mensajes[i].hora);
      }
      this.barChartData = [{ data: this.auxRR, label: 'Lluvia'}];
      this.barChartLabels = this.auxD;
    }else if (tipoR === '2'){
      for (i = 0; i < this.mensajes2.length; i++){
        if (Number(this.mensajes[i].lluvia) < 1000 && this.mensajes[i].lluvia != null){
          this.auxRR.push(Number(this.mensajes2[i].lluvia).toFixed(1));
        }else{
          this.auxRR.push(null);
        }
        this.auxD.push(this.mensajes2[i].dia.substr(8, 2) + '-' + this.mensajes2[i].dia.substr(5, 2));
      }
      this.barChartData = [{ data: this.auxRR, label: 'Lluvia'}];
      this.barChartLabels = this.auxD;
    }else{
      for (i = 0; i < this.mensajes3.length; i++){
        if (Number(this.mensajes[i].lluvia) < 1000 && this.mensajes[i].lluvia != null){
          this.auxRR.push(Number(this.mensajes3[i].lluvia).toFixed(1));
        }else{
          this.auxRR.push(null);
        }
        this.auxD.push( this.mesesCorto[parseInt(this.mensajes3[i].mes, 10) - 1] );
      }
      this.barChartData = [{ data: this.auxRR, label: 'Lluvia'}];
      this.barChartLabels = this.auxD;
    }
  }
  cargarImagen(){
    if (this.dato.RR_dia < 0.5){
      this.imagen = '../../assets/fondos/inicio-soleado.jpg';
    }else if (this.dato.RR_dia < 3) {
      this.imagen = '../../assets/fondos/lluvias2.jpg';
    }else if (this.dato.RR_dia < 10) {
      this.imagen = '../../assets/fondos/lluvias1.jpg';
    }else{
      this.imagen = '../../assets/fondos/lluvias3.jpg';
    }
    this.ubicacion = '../../assets/wheater-icons/ubicacion.png';
    this.mapas = '../../assets/tab-icons/btnMapas.png';
  }
}
