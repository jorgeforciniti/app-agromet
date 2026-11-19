import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './header/header.component';
import { EstacionSegmentComponent } from './estacion-segment/estacion-segment.component';
import { MapaSegmentComponent } from './mapa-segment/mapa-segment.component';
import { IonicModule } from '@ionic/angular';


@NgModule({
  declarations: [
    HeaderComponent,
    EstacionSegmentComponent,
    MapaSegmentComponent
  ],
  exports: [
    HeaderComponent,
    EstacionSegmentComponent,
    MapaSegmentComponent
  ],
  imports: [
    CommonModule,
    IonicModule
  ]
})
export class ComponentsModule { }
