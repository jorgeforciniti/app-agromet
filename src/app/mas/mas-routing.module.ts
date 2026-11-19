import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { MasPage } from './mas.page';

const routes: Routes = [
  {
    path: '',
    component: MasPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MasPageRoutingModule { }
