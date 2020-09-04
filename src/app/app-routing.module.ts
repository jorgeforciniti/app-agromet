import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  { path: '', loadChildren: () => import('./tabs/tabs.module').then(m => m.TabsPageModule) },
  { path: 'home', loadChildren: () => import('./tabs/tabs.module').then(m => m.TabsPageModule) },
  { path: 'localidades', loadChildren: () => import('./localidades/localidades.module').then( m => m.LocalidadesPageModule) },
  {
    path: 'mapathoy',
    loadChildren: () => import('./pages/mapathoy/mapathoy.module').then( m => m.MapathoyPageModule)
  },
  {
    path: 'mapat',
    loadChildren: () => import('./pages/mapat/mapat.module').then( m => m.MapatPageModule)
  },
  {
    path: 'mapa-rr',
    loadChildren: () => import('./pages/mapa-rr/mapa-rr.module').then( m => m.MapaRRPageModule)
  },
  {
    path: 'heladas',
    loadChildren: () => import('./heladas/heladas.module').then( m => m.HeladasPageModule)
  },
  {
    path: 'mapaheladas',
    loadChildren: () => import('./pages/mapaheladas/mapaheladas.module').then( m => m.MapaheladasPageModule)
  },
  {
    path: 'eventos',
    loadChildren: () => import('./eventos/eventos.module').then( m => m.EventosPageModule)
  },
  ];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
