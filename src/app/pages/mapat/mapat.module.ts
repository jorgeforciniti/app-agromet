import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MapatPageRoutingModule } from './mapat-routing.module';

import { MapatPage } from './mapat.page';
import { ComponentsModule } from 'src/app/components/components.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MapatPageRoutingModule,
    ComponentsModule
  ],
  declarations: [MapatPage]
})
export class MapatPageModule {}
