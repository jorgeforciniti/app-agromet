import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MapatPage } from './mapat.page';

const routes: Routes = [
  {
    path: '',
    component: MapatPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MapatPageRoutingModule {}
