import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MapaRRPage } from './mapa-rr.page';

const routes: Routes = [
  {
    path: '',
    component: MapaRRPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MapaRRPageRoutingModule {}
