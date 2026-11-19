import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CompararPageRoutingModule } from './comparar-routing.module';

import { CompararPage } from './comparar.page';
import { ComponentsModule } from '../components/components.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CompararPageRoutingModule,
    ComponentsModule
  ],
  declarations: [CompararPage]
})
export class CompararPageModule { }
