import { Component, OnInit } from '@angular/core';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { Platform, LoadingController } from '@ionic/angular';
import { SplashScreen } from '@ionic-native/splash-screen/ngx';
import { StatusBar } from '@ionic-native/status-bar/ngx';
import swal from 'sweetalert2';

import { of } from 'rxjs';
import { catchError, finalize, switchMap, tap } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss']
})
export class AppComponent implements OnInit {

  // *******  Importante: Cambiar la version
  version = { version: '2.2.4' };

  loading: number = 0;
  show = true;
  mostrar = false;
  mensajes: any;

  constructor(
    private estacionesService: EstacionesService,
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
      // En browser (ionic serve) esto tira warning (Cordova no disponible) => ok
      this.statusBar.styleDefault();
      this.splashScreen.hide();
    });
  }

  ngOnInit() {
    // habilitar para control de versiones
    // this.traerVersion();

    this.traeEstacionesYDatos();
  }

  // =========================
  // P0: estaciones + default 2049 + datos
  // =========================
  async traeEstacionesYDatos() {
    console.log('trae Estaciones y datos desde appComponent ****');

    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Espere por favor...',
    });

    await loading.present();

    this.estacionesService.getPosts().pipe(
      tap((stations: any[]) => {
        console.log('[APP] estaciones recibidas:', stations?.length);

        if (!Array.isArray(stations) || stations.length === 0) {
          throw new Error('NO HAY ESTACIONES (respuesta vacía).');
        }

        localStorage.setItem('estaciones', JSON.stringify(stations));

        // ✅ Selección: 2049 si existe, si no primera
        const estacion = this.ensureStationSelected(stations);
        if (!estacion) {
          throw new Error('No se pudo seleccionar una estación válida.');
        }

        localStorage.setItem('estacion', String(estacion));

        // ✅ Actualizar estado UI (lo que antes hacía traerDatos)
        this.mensajes = stations;
        this.loading = stations.length;
        this.show = false;
        this.mostrar = true;

        console.log('[APP] estacion elegida:', estacion);
      }),

      // Luego traemos datos de la estación elegida
      switchMap(() => {
        const estacion = localStorage.getItem('estacion');
        if (!estacion) return of(null);
        return this.estacionesService.getDatos(estacion).pipe(
          catchError(err => {
            console.error('[APP] ERROR getDatos:', err);
            return of(null);
          })
        );
      }),

      tap((datos: any) => {
        console.log('[APP] datos estacion recibidos:', datos);

        if (datos) {
          localStorage.setItem('datos', JSON.stringify(datos));
        }
      }),

      catchError(err => {
        console.error('[APP] ERROR traeEstacionesYDatos:', err);
        return of(null);
      }),

      // ✅ Pase lo que pase: cerrar loading
      finalize(() => {
        loading.dismiss().catch(() => {});
      })
    ).subscribe();
  }

  // =========================
  // Selección default
  // =========================
  private ensureStationSelected(stations: any[]): string | null {
    const current = localStorage.getItem('estacion');

    // Si no hay, o está inválida, elegimos default
    if (!current || current === '0' || current === 'null' || current === 'undefined') {
      const def = this.pickDefaultStationId(stations);
      return def;
    }

    // Si existe, validarla: si no está en la lista, volvemos a default
    const exists = stations.some(s => String(s?.Identificacion) === String(current));
    if (!exists) {
      return this.pickDefaultStationId(stations);
    }

    return current;
  }

  private pickDefaultStationId(stations: any[]): string | null {
    if (!Array.isArray(stations) || stations.length === 0) return null;

    const target = '2049';

    const found = stations.find(s => String(s?.Identificacion) === target);
    const chosen = found ?? stations[0];

    const id = chosen?.Identificacion;
    return id != null ? String(id) : null;
  }

  // =========================
  // Control de versiones
  // =========================
  async traerVersion() {
    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Espere por favor...',
    });
    await loading.present();

    console.log('Version: ' + this.version.version);

    this.estacionesService.getVersion().pipe(
      tap((posts: any) => {
        this.mensajes = posts;

        const versionNueva = this.mensajes?.versionNueva ?? '';
        const link = this.plt.is('android') ? this.mensajes?.android : this.mensajes?.ios;

        if (versionNueva && versionNueva !== this.version.version) {
          swal.fire({
            title: 'Existe una nueva versión',
            icon: 'question',
            text: 'Desea actualizar su aplicación ?',
            confirmButtonColor: '#3085d6',
            confirmButtonText: 'Actualizar!',
            cancelButtonColor: '#d33',
            cancelButtonText: 'No, gracias',
            showCancelButton: true,
            reverseButtons: false
          }).then((result) => {
            if (result.value) window.open(link);
          });
        }
      }),
      catchError(err => {
        console.error('ERROR traerVersion:', err);
        return of(null);
      }),
      finalize(() => {
        loading.dismiss().catch(() => {});
      })
    ).subscribe();
  }

  banderas(valor: string) {
    localStorage.setItem('home', valor);
    localStorage.setItem('temperatura', valor);
    localStorage.setItem('lluvia', valor);
    localStorage.setItem('helada', valor);
  }
}
