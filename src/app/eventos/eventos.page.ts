import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { LoadingController } from '@ionic/angular';
import { InAppBrowser } from '@ionic-native/in-app-browser/ngx';

@Component({
  selector: 'app-eventos',
  templateUrl: './eventos.page.html',
  styleUrls: ['./eventos.page.scss'],
})
export class EventosPage implements OnInit {

  mensajes: any[] = [];
  imagen: string;

  constructor(
    private datosNoticias: EstacionesService,
    private router: Router,
    public loadingCtrl: LoadingController,
    private iab: InAppBrowser) { }

  ngOnInit() {
    this.traerNoticias();
    this.imagen = '../../assets/fondos/eventos.jpg';
  }

  async traerNoticias(){

    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Espere por favor...',
    });
    await loading.present();

    this.datosNoticias.getNoticias()
      .subscribe( (posts: any[]) => {
        this.mensajes = posts;
        loading.dismiss();
        let i: number;
        for (i = 0; i < this.mensajes.length; i++){
          const dia = this.mensajes[i].fecha.substr(8, 2);
          const mes = this.mensajes[i].fecha.substr(5, 2);
          const anio = this.mensajes[i].fecha.substr(0, 4);
          const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
          const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
          const dt = new Date(mes + ' ' + dia + ', ' + anio);
          const diaSemana = dias[dt.getUTCDay()];
          const nombreMes = meses[parseInt(mes, 10) - 1];
          this.mensajes[i].fecha = diaSemana + ', ' + dia + ' de ' + nombreMes + ' de ' + anio;
          if (this.mensajes[i].imagen){
            this.mensajes[i].imagen = this.mensajes[i].imagen;
          }
        }
        loading.dismiss();
    });
  }

  abrirNoticia(item){
    if (item.link){
      const browser = this.iab.create(item.link, '_system');
    }
  }

}
