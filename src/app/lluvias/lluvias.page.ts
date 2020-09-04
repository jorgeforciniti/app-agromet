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
  rrAyer = 0;

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

  constructor( private datosLluvias: EstacionesService, private router: Router, public loadingCtrl: LoadingController) {
    this.cargarDatos();
  }

  ngDoCheck() {
    if (localStorage.getItem('lluvia') === '1'){
      this.cargarDatos();
      this.traerRRMes();
      localStorage.setItem('lluvia', '0');
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
    .subscribe( (posts: any[]) => {
      this.mensajes = posts;
      let i: number;
      for (i = 0; i < this.mensajes.length; i++){
        this.auxRR.push(Number(this.mensajes[i].lluvia));
        this.auxD.push(this.mensajes[i].dia);
      }
      this.rrAyer = Number(this.mensajes[this.mensajes.length - 2].lluvia);
      this.barChartData = [{ data: this.auxRR, label: 'Lluvia'}];
      this.barChartLabels = this.auxD;
      loading.dismiss();
    });
  }

  onClickAhora(){
     this.router.navigate(['tabs/mapa-rr']);
  }
}
