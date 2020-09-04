import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MapaRRPageRoutingModule } from './mapa-rr-routing.module';

import { MapaRRPage } from './mapa-rr.page';
import { ComponentsModule } from 'src/app/components/components.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MapaRRPageRoutingModule,
    ComponentsModule
  ],
  declarations: [MapaRRPage]
})
export class MapaRRPageModule {}
