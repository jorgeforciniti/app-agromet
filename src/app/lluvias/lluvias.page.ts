import { Router } from '@angular/router';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { ChartOptions, ChartType, ChartDataSets } from 'chart.js';
import { Color, Label, BaseChartDirective } from 'ng2-charts';
import { LoadingController } from '@ionic/angular';
import { Component, DoCheck, OnInit, ViewChild } from '@angular/core';

@Component({
  selector: 'app-lluvias',
  templateUrl: 'lluvias.page.html',
  styleUrls: ['lluvias.page.scss']
})
export class LluviasPage implements DoCheck, OnInit {

  public showChart = false;   // 👈 canvas se crea cuando yo quiero
  private firstLoadDone = false;
  dato: any;
  dia: string;
  nombreMes: string;
  anio: string;
  hora: string;
  diaSemana: string;

  mensajes: any[] = [];   // hoy (intervalos)
  mensajes2: any[] = [];  // 30 días
  mensajes3: any[] = [];  // mensual

  rrAyer = 0;
  mesesCorto = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  private auxRR: any[] = [];
  private auxD: any[] = [];

  selectedRange: '1' | '2' | '3' = '1';
  isLoading = false;

  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

  public barChartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 } as any,
    scales: {
      xAxes: [{
        ticks: {
          fontColor: '#d7d7d7' as any,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 10
        },
        gridLines: { display: false }
      }],
      yAxes: [{
        ticks: {
          fontColor: '#d7d7d7' as any,
          beginAtZero: true,
          maxTicksLimit: 6
        },
        scaleLabel: { display: true, labelString: 'mm' },
        gridLines: { display: true }
      }]
    },
    legend: { display: false } as any
  };


  public barChartLabels: Label[] = [];
  public barChartType: ChartType = 'bar';
  public barChartLegend = false;

  public barChartData: ChartDataSets[] = [{ data: [], label: 'Lluvia' }];

  public barChartColors: Color[] = [{
    backgroundColor: 'rgba(128, 227, 211, 0.65)',
    borderColor: 'rgba(128, 227, 211, 1)'
  }];

  imagen: string;
  ubicacion: string;
  mapas: string;

  constructor(
    private datosLluvias: EstacionesService,
    private router: Router,
    public loadingCtrl: LoadingController,
  ) {
    this.cargarDatos();
    this.cargarImagen();
  }

  ngAfterViewInit() {
    this.recrearCanvas();
  }

  ionViewDidEnter() {
    this.recrearCanvas();
  }

  ngOnInit() {
    // Carga inicial SIEMPRE (resuelve el caso F5)
    this.cargarDatos();
    this.cargarImagen();
    this.traerRRMes();
    this.firstLoadDone = true;
  }

  ngDoCheck() {
  if (localStorage.getItem('lluvia') === '1') {
    this.cargarDatos();
    this.traerRRMes();
    localStorage.setItem('lluvia', '0');
    this.cargarImagen();
  }
}

  cargarDatos() {
    this.dato = JSON.parse(localStorage.getItem('datos') || 'null');
    if (!this.dato?.fecha_I) return;

    this.dia = this.dato.fecha_I.substr(8, 2);
    const mes = this.dato.fecha_I.substr(5, 2);
    this.anio = this.dato.fecha_I.substr(0, 4);

    const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    const dt = new Date(mes + ' ' + this.dia + ', ' + this.anio);
    this.diaSemana = dias[dt.getUTCDay()];
    this.nombreMes = meses[parseInt(mes, 10) - 1];

    this.hora = this.dato.fecha_I.substr(11, 5);

    this.dato.RR_dia = Number(this.dato.RR_dia);
    this.dato.rr_mes = Number(this.dato.rr_mes);
    this.dato.rr_15 = Number(this.dato.rr_15);
  }

  async traerRRMes() {
    this.auxRR = [];
    this.auxD = [];
    this.isLoading = true;

    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Espere por favor...',
    });
    await loading.present();

    const estacion = Number(localStorage.getItem('estacion') ?? 0);

    this.datosLluvias.getRRMes(estacion).subscribe({
      next: (posts: any[]) => {
        this.mensajes = posts?.[0] || [];
        this.mensajes2 = posts?.[1] || [];
        this.mensajes3 = posts?.[2] || [];

        this.selectedRange = '1';

        // 1) armá datos/labels primero
        this.traerRR('1');

        // 2) recién ahora creá el canvas (recreación)
        this.recrearCanvas();
      },
      error: () => {
        this.isLoading = false;
      },
      complete: () => {
        this.isLoading = false;
        loading.dismiss().catch(() => { });
      }
    });
  }

  onRangeChange(ev: any) {
    const v = String(ev?.detail?.value || '1') as '1' | '2' | '3';
    this.selectedRange = v;
    this.traerRR(v);
    this.recrearCanvas();
  }

  onClickAhora() {
    this.router.navigate(['tabs/mapa-rr']);
  }

  traerRR(tipoR: '1' | '2' | '3') {
    this.auxRR = [];
    this.auxD = [];

    try {
      if (this.mensajes2?.length >= 2) {
        this.rrAyer = Number(this.mensajes2[this.mensajes2.length - 2].lluvia);
      } else {
        this.rrAyer = 0;
      }
    } catch {
      this.rrAyer = 0;
    }

    const hoy = new Date();
    const mm = hoy.getMonth();

    try {
      this.dato.rr_mes = Number(this.mensajes3?.[mm]?.lluvia);
    } catch {
      this.dato.rr_mes = Number(this.mensajes3?.[this.mensajes3.length - 1]?.lluvia || 0);
    }

    if (tipoR === '1') {
      for (let i = 0; i < this.mensajes.length; i++) {
        const v = Number(this.mensajes[i].lluvia);
        this.auxRR.push((v < 500 && this.mensajes[i].lluvia != null) ? Number(v.toFixed(1)) : null);
        this.auxD.push(this.mensajes[i].hora);
      }
    } else if (tipoR === '2') {
      for (let i = 0; i < this.mensajes2.length; i++) {
        const v = Number(this.mensajes2[i].lluvia);
        this.auxRR.push((v < 1000 && this.mensajes2[i].lluvia != null) ? Number(v.toFixed(1)) : null);
        this.auxD.push(this.mensajes2[i].dia.substr(8, 2) + '-' + this.mensajes2[i].dia.substr(5, 2));
      }
    } else {
      for (let i = 0; i < this.mensajes3.length; i++) {
        const v = Number(this.mensajes3[i].lluvia);
        this.auxRR.push((v < 1000 && this.mensajes3[i].lluvia != null) ? Number(v.toFixed(1)) : null);
        this.auxD.push(this.mesesCorto[parseInt(this.mensajes3[i].mes, 10) - 1]);
      }
    }

    // ⚠️ claves: nuevas referencias SIEMPRE
    this.barChartData = [{ data: this.auxRR, label: 'Lluvia' }];
    this.barChartLabels = [...this.auxD];
    this.recrearCanvas();
  }

  cargarImagen() {
    if (!this.dato) return;

    if (this.dato.RR_dia < 0.5) this.imagen = '../../assets/fondos/inicio-soleado.jpg';
    else if (this.dato.RR_dia < 3) this.imagen = '../../assets/fondos/lluvias2.jpg';
    else if (this.dato.RR_dia < 10) this.imagen = '../../assets/fondos/lluvias1.jpg';
    else this.imagen = '../../assets/fondos/lluvias3.jpg';

    this.ubicacion = '../../assets/wheater-icons/ubicacion.png';
    this.mapas = '../../assets/tab-icons/btnMapas.png';
  }

  goLocalidades() {
    this.router.navigate(['/localidades']);
  }

  private recrearCanvas() {
    // Apago y prendo el canvas para que Chart.js vuelva a medir el contenedor
    this.showChart = false;

    setTimeout(() => {
      this.showChart = true;

      // doble RAF = Ionic termina layout y Chart mide bien
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            this.chart?.chart?.resize();
            this.chart?.update();
          } catch { }
        });
      });

    }, 0);
  }

}
