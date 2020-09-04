import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { HeladasPageRoutingModule } from './heladas-routing.module';

import { HeladasPage } from './heladas.page';
import { ComponentsModule } from '../components/components.module';
import { ChartsModule } from 'ng2-charts';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    HeladasPageRoutingModule,
    ComponentsModule,
    ChartsModule
  ],
  declarations: [HeladasPage]
})
export class HeladasPageModule {}
