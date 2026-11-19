import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CuadernoPageRoutingModule } from './cuaderno-routing.module';

import { CuadernoPage } from './cuaderno.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CuadernoPageRoutingModule
  ],
  declarations: [CuadernoPage]
})
export class CuadernoPageModule { }
