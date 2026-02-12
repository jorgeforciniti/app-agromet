import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AplicacionesPageRoutingModule } from './aplicaciones-routing.module';
import { AplicacionesPage } from './aplicaciones.page';

import { InfoModalComponent } from './info-modal.component'; // <-- agregar

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,                 
    AplicacionesPageRoutingModule
  ],
  declarations: [
    AplicacionesPage,
    InfoModalComponent           // <-- agregar
  ],
  entryComponents: [
    InfoModalComponent           // <-- SOLO si tu Ionic/Angular lo requiere (Ionic 4/Angular 8)
  ]
})
export class AplicacionesPageModule {}
