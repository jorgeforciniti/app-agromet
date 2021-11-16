import { Component, OnInit, DoCheck } from '@angular/core';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { Platform } from '@ionic/angular';
import { SplashScreen } from '@ionic-native/splash-screen/ngx';
import { StatusBar } from '@ionic-native/status-bar/ngx';
import swal from 'sweetalert2';
import { LoadingController } from '@ionic/angular';
import {enableProdMode} from '@angular/core';

// enableProdMode();

localStorage.setItem('estacion', '2049');

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss']
})

export class AppComponent implements OnInit, DoCheck {
  constructor(
    private datosEstaciones: EstacionesService,
    private platform: Platform,
    private splashScreen: SplashScreen,
    private statusBar: StatusBar,
    private plt: Platform,
    public loadingCtrl: LoadingController
    ) {
      this.initializeApp();
    }

  // *******  Importante
  // Cambiar la version

  version = {version: '2.2.4'};

  loading: number;
  show = true;
  mostrar = false;
  mensajes: any;

  initializeApp() {
    this.platform.ready().then(() => {
      this.statusBar.styleDefault();
      this.splashScreen.hide();
    });
  }

  ngOnInit() {
    // habilitar para control de versiones
    // this.traerVersion();

    this.loading = 0;
    this.traeEstaciones();
  }

  ngDoCheck() {
//    this.traerDatos();
  }

  async traeEstaciones(){
    console.log('trae Estaciones y datos desde appComponent ****');
    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Espere por favor...',
    });
    await loading.present();

    this.datosEstaciones.getPosts()
      // tslint:disable-next-line: deprecation
      .subscribe( (posts: any[]) => {
        this.mensajes = posts;
        localStorage.setItem('estaciones', JSON.stringify(this.mensajes));
      });

    this.datosEstaciones.getDatos()
    // tslint:disable-next-line: deprecation
    .subscribe( (posts: any[]) => {
      localStorage.setItem('datos', JSON.stringify(posts));
      loading.dismiss();
      this.traerDatos();
      this.banderas('1');
    });
  }

  async traerDatos(){
    console.log('traerDatos (appComponent)');
    this.mensajes = JSON.parse(localStorage.getItem('estaciones'));
    try {
      this.loading = this.mensajes.length;
      this.show = false;
      this.mostrar = true;
    } catch (error) {
      console.log("Error!!!: " + error);
    }
  }

/* ************************ */
  async traerVersion(){
    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Espere por favor...',
    });
    await loading.present();

    console.log('Version: ' + this.version.version);
    this.datosEstaciones.getVersion()
    // tslint:disable-next-line: deprecation
    .subscribe( (posts: any[]) => {
      this.mensajes = posts;
      let versionNueva = '';
      let link = '';
      versionNueva = this.mensajes.versionNueva;
      if (this.plt.is('android')){
        link = this.mensajes.android;
      }else{
        link = this.mensajes.ios;
      }

      if ( versionNueva !== this.version.version ){
        swal.fire({
          title: 'Existe una nueva versión',
          icon: 'question',
          text: 'Desea actualizar su aplicación ?' ,
          confirmButtonColor: '#3085d6',
          confirmButtonText: 'Actualizar!',
          cancelButtonColor: '#d33',
          cancelButtonText: 'No, gracias',
          showCancelButton: true,
          reverseButtons: false
        })
        .then((result) => { if (result.value){
          window.open(link); } });
          // Salir de la app
      }

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
