import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MasPageRoutingModule } from './mas-routing.module';

import { MasPage } from './mas.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MasPageRoutingModule
  ],
  declarations: [MasPage]
})
export class MasPageModule { }
