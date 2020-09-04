import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TemperaturaPage } from './temperatura.page';
import { ExploreContainerComponentModule } from '../explore-container/explore-container.module';

import { TemperaturaPageRoutingModule } from './temperatura-routing.module';
import { ComponentsModule } from '../components/components.module';
import { ChartsModule } from 'ng2-charts';


@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    ExploreContainerComponentModule,
    TemperaturaPageRoutingModule,
    ComponentsModule,
    ChartsModule
  ],
  declarations: [TemperaturaPage]
})

export class TemperaturaPageModule {}
