import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MapathoyPageRoutingModule } from './mapathoy-routing.module';

import { MapathoyPage } from './mapathoy.page';
import { ComponentsModule } from 'src/app/components/components.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MapathoyPageRoutingModule,
    ComponentsModule
  ],
  declarations: [MapathoyPage]
})
export class MapathoyPageModule {}
