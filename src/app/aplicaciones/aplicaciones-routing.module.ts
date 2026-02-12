import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AplicacionesPage } from './aplicaciones.page';

const routes: Routes = [
  {
    path: '',
    component: AplicacionesPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AplicacionesPageRoutingModule {}
