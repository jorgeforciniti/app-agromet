import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { HeladasPage } from './heladas.page';

const routes: Routes = [
  {
    path: '',
    component: HeladasPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HeladasPageRoutingModule {}
