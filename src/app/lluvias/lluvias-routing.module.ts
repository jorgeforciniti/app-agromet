import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LluviasPage } from './lluvias.page';

const routes: Routes = [
  {
    path: '',
    component: LluviasPage,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class LluviasPageRoutingModule {}
