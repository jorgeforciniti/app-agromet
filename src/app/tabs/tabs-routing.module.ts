import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'home',
        loadChildren: () => import('../home/home.module').then(m => m.HomePageModule)
      },
      {
        path: 'temperatura',
        loadChildren: () => import('../temperatura/temperatura.module').then(m => m.TemperaturaPageModule)
      },
      {
        path: 'mapat',
        loadChildren: () => import('../pages/mapat/mapat.module').then(m => m.MapatPageModule)
      },
      {
        path: 'mapathoy',
        loadChildren: () => import('../pages/mapathoy/mapathoy.module').then(m => m.MapathoyPageModule)
      },
      {
        path: 'lluvias',
        loadChildren: () => import('../lluvias/lluvias.module').then(m => m.LluviasPageModule)
      },
      {
        path: 'mapa-rr',
        loadChildren: () => import('../pages/mapa-rr/mapa-rr.module').then(m => m.MapaRRPageModule)
      },
      {
        path: 'heladas',
        loadChildren: () => import('../heladas/heladas.module').then(m => m.HeladasPageModule)
      },
      {
        path: 'mapaheladas',
        loadChildren: () => import('../pages/mapaheladas/mapaheladas.module').then(m => m.MapaheladasPageModule)
      },
      {
        path: 'eventos',
        loadChildren: () => import('../eventos/eventos.module').then(m => m.EventosPageModule)
      },
      {
        path: '',
        redirectTo: '/tabs/home',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: '',
    redirectTo: '/tabs/home',
    pathMatch: 'full'
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TabsPageRoutingModule {}
