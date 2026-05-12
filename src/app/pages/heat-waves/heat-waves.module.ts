// filepath: src/app/pages/heat-waves/heat-waves.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { HeatWavesPageRoutingModule } from './heat-waves-routing.module';
import { HeatWavesPage } from './heat-waves.page';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, HeatWavesPageRoutingModule],
  declarations: [HeatWavesPage],
})
export class HeatWavesPageModule {}