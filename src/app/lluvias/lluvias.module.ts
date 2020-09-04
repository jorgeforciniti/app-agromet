import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LluviasPage } from './lluvias.page';
import { ExploreContainerComponentModule } from '../explore-container/explore-container.module';

import { LluviasPageRoutingModule } from './lluvias-routing.module';
import { ComponentsModule } from '../components/components.module';
import { ChartsModule } from 'ng2-charts';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    ExploreContainerComponentModule,
    LluviasPageRoutingModule,
    ComponentsModule,
    ChartsModule
  ],
  declarations: [LluviasPage]
})
export class LluviasPageModule {}
