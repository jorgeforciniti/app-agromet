import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { CompararPage } from './comparar.page';

const routes: Routes = [
  {
    path: '',
    component: CompararPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CompararPageRoutingModule { }
