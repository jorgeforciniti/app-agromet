import { Component, OnInit } from '@angular/core';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { Platform, LoadingController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { SplashScreen } from '@ionic-native/splash-screen/ngx';
import { StatusBar } from '@ionic-native/status-bar/ngx';
import swal from 'sweetalert2';
import { PushNavigationIntent, PushService } from './services/push.service';
import { CuentaSyncService } from './services/cuenta-sync.service';
import { of, ReplaySubject } from 'rxjs';
import { catchError, filter, finalize, map, switchMap, take, tap } from 'rxjs/operators';

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

  // Emite una vez que localStorage['estaciones'] está disponible y validado.
  // ReplaySubject(1): si el push llega antes (cold start), lo espera igual.
  private estacionesListas$ = new ReplaySubject<void>(1);

  constructor(
    private estacionesService: EstacionesService,
    private platform: Platform,
    private splashScreen: SplashScreen,
    private statusBar: StatusBar,
    private plt: Platform,
    public loadingCtrl: LoadingController,
    private pushService: PushService,
    private router: Router,
    private toastCtrl: ToastController,
    // Se crea al arrancar: con sesión iniciada sincroniza favoritas y cuaderno con la cuenta
    private cuentaSync: CuentaSyncService
  ) {
    this.initializeApp();
  }

  initializeApp() {
    this.platform.ready().then(() => {
      // En browser (ionic serve) Cordova/Capacitor no está disponible.
      // Evitamos warnings llamando plugins solo en dispositivo/simulador.
      const isNative = this.platform.is('cordova') || this.platform.is('capacitor');
      if (isNative) {
        this.statusBar.styleDefault();
        this.splashScreen.hide();
      }
    });
  }

  ngOnInit() {
    // habilitar para control de versiones
    // this.traerVersion();
    this.traeEstacionesYDatos();
    this.pushService.initPush();

    this.pushService.pendingNavigation$
      .pipe(
        filter((intent): intent is PushNavigationIntent => !!intent),
        switchMap(intent => this.estacionesListas$.pipe(take(1), map(() => intent)))
      )
      .subscribe(intent => {
        this.procesarPushPendiente(intent);
        this.pushService.clearPendingNavigation();
      });
  }

  // =========================
  // P0: estaciones + default 2049 + datos
  // =========================
  async traeEstacionesYDatos() {
    // Con la lista y la estación de la vez anterior la app ya puede mostrarse: se actualiza por detrás.
    // El cartel que bloquea queda sólo para la primera vez (o si se borró lo guardado).
    const hayGuardado = this.safeParseStations().length > 0 && !!localStorage.getItem('estacion');
    let loading: HTMLIonLoadingElement | null = null;

    if (!hayGuardado) {
      loading = await this.loadingCtrl.create({
        spinner: 'bubbles',
        translucent: true,
        cssClass: 'custom-class custom-loading',
        showBackdrop: false,
        message: 'Espere por favor...',
      });

      await loading.present();
    }

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

        // Si sigue siendo la misma estación no se avisa de nuevo: las páginas ya la están mostrando y
        // volverían a pedir los datos
        if (estacion !== localStorage.getItem('estacion')) {
          this.estacionesService.setSelectedStation(estacion);
        }

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
        loading?.dismiss().catch(() => {});
        // Pase lo que pase (éxito o error), ya podemos resolver un deep link
        // de push pendiente: si falló la carga, igual no conviene dejarlo
        // esperando para siempre.
        this.estacionesListas$.next();
      })
    ).subscribe();
  }

  // =========================
  // Deep link de push
  // =========================
  private procesarPushPendiente(intent: PushNavigationIntent) {
    const stations = this.safeParseStations();
    const estacionId = intent.estacionId;

    if (estacionId) {
      const existe = stations.some(
        s => String(s?.Identificacion ?? s?.identificacion) === estacionId
      );

      if (existe) {
        this.estacionesService.setSelectedStation(estacionId);
        localStorage.removeItem('datos');
      } else {
        console.warn('[PUSH] Estación del deep link ya no existe:', estacionId);
        this.mostrarToastRecursoInexistente();
        this.router.navigate(['/tabs/home']);
        return;
      }
    }

    this.router.navigate([this.rutaPorTipoPush(intent.tipo)]);
  }

  private rutaPorTipoPush(tipo: string): string {
    switch (tipo) {
      case 'helada_inicio':
      case 'helada':
        return '/tabs/heladas';
      case 'smn':
      case 'smn_alerta':
        return '/tabs/alertas';
      default:
        return '/tabs/home';
    }
  }

  private async mostrarToastRecursoInexistente() {
    const toast = await this.toastCtrl.create({
      message: 'La estación de esa notificación ya no está disponible.',
      duration: 3000,
      position: 'bottom',
      color: 'warning',
    });
    await toast.present();
  }

  private safeParseStations(): any[] {
    try {
      const raw = JSON.parse(localStorage.getItem('estaciones') || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
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
