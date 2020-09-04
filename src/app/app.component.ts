import { Component, OnInit, DoCheck, ɵConsole } from '@angular/core';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { Platform } from '@ionic/angular';
import { SplashScreen } from '@ionic-native/splash-screen/ngx';
import { StatusBar } from '@ionic-native/status-bar/ngx';
import swal from 'sweetalert2';
import { LoadingController } from '@ionic/angular';

localStorage.setItem('estacion', '2049');

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss']
})

export class AppComponent implements OnInit, DoCheck {
  loading: number;
  show = true;
  mostrar = false;
  mensajes: any;
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

  initializeApp() {
    this.platform.ready().then(() => {
      this.statusBar.styleDefault();
      this.splashScreen.hide();
    });
  }

  ngOnInit() {
    this.traerVersion();
    this.loading = 0;
    this.traeEstaciones();
  }

  ngDoCheck() {
    this.traerDatos();
  }

  async traerDatos(){
    this.mensajes = JSON.parse(localStorage.getItem('estaciones'));
    try {
      this.loading = this.mensajes.length;
      this.show = false;
      this.mostrar = true;
    } catch (error) {
      console.log(error);
    }
  }

  async traeEstaciones(){
    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Espere por favor...',
    });
    await loading.present();

    this.datosEstaciones.getPosts()
      .subscribe( (posts: any[]) => {
        this.mensajes = posts;
        localStorage.setItem('estaciones', JSON.stringify(this.mensajes));
      });

    this.datosEstaciones.getDatos()
    .subscribe( (posts: any[]) => {
      localStorage.setItem('datos', JSON.stringify(posts));
      loading.dismiss();
    });
    localStorage.setItem('temperatura', '1');
    localStorage.setItem('lluvia', '1');
    localStorage.setItem('helada', '1');
  }

  async traerVersion(){
    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Espere por favor...',
    });
    await loading.present();

    this.datosEstaciones.getVersion()
    .subscribe( (posts: any[]) => {
      this.mensajes = posts;
      let version = 0;
      let link = '';
      version = Number(this.mensajes.version);
      // console.log(this.plt);
      if (this.plt.is('android')){
        link = this.mensajes.android;
      }else{
        link = this.mensajes.ios;
      }
      // console.log(link);
      if ( version > 0 ){
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
}
