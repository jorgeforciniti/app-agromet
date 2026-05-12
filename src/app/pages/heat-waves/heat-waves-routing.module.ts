// filepath: src/app/pages/heat-waves/heat-waves-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HeatWavesPage } from './heat-waves.page';

const routes: Routes = [
  {
    path: '',
    component: HeatWavesPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HeatWavesPageRoutingModule {}