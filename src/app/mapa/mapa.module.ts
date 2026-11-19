import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MapaPageRoutingModule } from './mapa-routing.module';

import { MapaPage } from './mapa.page';
import { ComponentsModule } from '../components/components.module';

import { MapatPageModule } from '../pages/mapat/mapat.module';
import { MapathoyPageModule } from '../pages/mapathoy/mapathoy.module';
import { MapaRRPageModule } from '../pages/mapa-rr/mapa-rr.module';
import { MapaheladasPageModule } from '../pages/mapaheladas/mapaheladas.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MapaPageRoutingModule,
    ComponentsModule,
    MapatPageModule,
    MapathoyPageModule,
    MapaRRPageModule,
    MapaheladasPageModule
  ],
  declarations: [MapaPage]
})
export class MapaPageModule { }
