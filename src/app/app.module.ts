import { LOCALE_ID, NgModule } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { SplashScreen } from '@ionic-native/splash-screen/ngx';
import { StatusBar } from '@ionic-native/status-bar/ngx';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { ComponentsModule } from './components/components.module';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { SinConexionInterceptor } from './services/sin-conexion.interceptor';
import { InAppBrowser } from '@ionic-native/in-app-browser/ngx';

import { IonicStorageModule } from '@ionic/storage';

// Gráficos
import { ChartsModule } from 'ng2-charts';

// Pipes `number` y `date` con coma decimal y fechas en español de Argentina
registerLocaleData(localeEsAr, 'es-AR');

@NgModule({
  declarations: [AppComponent],
  entryComponents: [],
  imports: [
    BrowserModule,
    IonicModule.forRoot(),
    AppRoutingModule,
    ComponentsModule,
    HttpClientModule,
    IonicStorageModule.forRoot(),
    ChartsModule
  ],
  providers: [
    StatusBar,
    SplashScreen,
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: LOCALE_ID, useValue: 'es-AR' },
    InAppBrowser,
    // Sin señal se muestra la última respuesta guardada de cada consulta
    { provide: HTTP_INTERCEPTORS, useClass: SinConexionInterceptor, multi: true }
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
