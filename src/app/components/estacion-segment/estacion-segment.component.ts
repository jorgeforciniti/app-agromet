import { Component, Input } from '@angular/core';
import { NavController } from '@ionic/angular';

type EstacionTab = 'resumen' | 'temperatura' | 'lluvias' | 'heladas';

@Component({
  selector: 'app-estacion-segment',
  templateUrl: './estacion-segment.component.html',
  styleUrls: ['./estacion-segment.component.scss'],
})
export class EstacionSegmentComponent {
  /**
   * Cada página que usa este componente declara explícitamente cuál es,
   * en vez de que el segmento la infiera de la URL: Ionic mantiene en
   * caché las páginas de tabs, así que una detección basada en el router
   * quedaba desincronizada al volver de otra tab.
   */
  @Input() value: EstacionTab = 'temperatura';

  constructor(private navCtrl: NavController) { }

  onChange(ev: any) {
    const v = ev?.detail?.value as EstacionTab;
    if (v && v !== this.value) {
      this.navCtrl.navigateRoot(['/tabs/' + v], { animated: false });
    }
  }
}
