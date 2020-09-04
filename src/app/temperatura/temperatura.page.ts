import { Component, DoCheck } from '@angular/core';
import { Router } from '@angular/router';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { ChartDataSets, ChartOptions } from 'chart.js';
import { Color, Label } from 'ng2-charts';
import { LoadingController } from '@ionic/angular';

@Component({
  selector: 'app-temperatura',
  templateUrl: 'temperatura.page.html',
  styleUrls: ['temperatura.page.scss']
})

export class TemperaturaPage implements DoCheck{

  dato: any;
  dia: string;
  nombreMes: string;
  anio: string;
  hora: string;
  diaSemana: string;
  mensajes: any[] = [];
  tMax = 0;
  tMin = 0;
  // *************************************************

  private auxT: any[] = [];
  private auxH: any[] = [];
  public lineChartData: ChartDataSets[] = [
    { data: [0, 0, 0, 0, 0, 0, 0], label: 'Series A' }
  ];
  public lineChartLabels: Label[] = [];

  public lineChartOptions: (ChartOptions) = {
    responsive: true,
    scales: {
      xAxes: [{}],
      yAxes: [
        {
          id: 'y-axis-0',
          position: 'left',
          scaleLabel: {display: true, labelString: 'ºC'}
        }
      ]
    }
  };

  public lineChartColors: Color[] = [
    { // red
      backgroundColor: 'rgba(255,0,0,0.0)',
      borderColor: 'rgba(255,0,0,0.6)',
      pointBackgroundColor: 'rgba(255,0,0,1)',
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: 'rgba(0,0,0,0.8)'
    }
  ];
  public lineChartLegend = false;
  public lineChartType = 'line';

  // **************************************************

  constructor( private datosTemperaturas: EstacionesService, private router: Router, public loadingCtrl: LoadingController) {
    this.cargarDatos();
  }

  ngDoCheck() {
    if (localStorage.getItem('temperatura') === '1'){
      this.cargarDatos();
      this.traerTemp24hs();
      localStorage.setItem('temperatura', '0');
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

  async traerTemp24hs(){
    this.auxT = [];
    this.auxH = [];
    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Espere por favor...',
    });
    await loading.present();

    this.datosTemperaturas.getTemperatura24()
    .subscribe( (posts: any[]) => {
      this.mensajes = posts;
      let i: number;
      for (i = 0; i < this.mensajes.length; i++){
        if (Number(this.mensajes[i].temperatura) > -20 &&
          Number(this.mensajes[i].temperatura) < 60 &&
          this.mensajes[i].temperatura != null){
          this.auxT.push(Number(this.mensajes[i].temperatura));
        }else{
          this.auxT.push(null);
        }
        this.auxH.push(this.mensajes[i].hora);
      }
      this.lineChartData = [{ data: this.auxT, label: 'Temperatura'}];
      this.lineChartLabels = this.auxH;
      this.tMax = Math.max.apply(null, this.auxT);
      this.tMin = Math.min.apply(null, this.auxT);
      loading.dismiss();
  });
  }

  onClickAhora(){
    this.router.navigate(['tabs/mapat']);
  }
  onClickHoy(){
    this.router.navigate(['tabs/mapathoy']);
  }
}
