import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MapaheladasPageRoutingModule } from './mapaheladas-routing.module';

import { MapaheladasPage } from './mapaheladas.page';
import { ComponentsModule } from 'src/app/components/components.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MapaheladasPageRoutingModule,
    ComponentsModule
  ],
  declarations: [MapaheladasPage]
})
export class MapaheladasPageModule {}
