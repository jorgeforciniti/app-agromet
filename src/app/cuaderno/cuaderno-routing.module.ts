import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { CuadernoPage } from './cuaderno.page';

const routes: Routes = [
  {
    path: '',
    component: CuadernoPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CuadernoPageRoutingModule { }
