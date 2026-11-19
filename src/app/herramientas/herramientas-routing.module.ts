import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { HerramientasPage } from './herramientas.page';

const routes: Routes = [
  {
    path: '',
    component: HerramientasPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HerramientasPageRoutingModule { }
