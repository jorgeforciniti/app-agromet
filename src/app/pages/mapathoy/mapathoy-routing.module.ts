import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MapathoyPage } from './mapathoy.page';

const routes: Routes = [
  {
    path: '',
    component: MapathoyPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MapathoyPageRoutingModule {}
