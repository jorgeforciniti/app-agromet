import { Component, EventEmitter, Input, Output } from '@angular/core';

export type MapaTab = 'mapat' | 'mapathoy' | 'mapa-rr' | 'mapaheladas' | 'satelite';

@Component({
  selector: 'app-mapa-segment',
  templateUrl: './mapa-segment.component.html',
  styleUrls: ['./mapa-segment.component.scss'],
})
export class MapaSegmentComponent {
  /** Puramente presentacional: quien lo contiene decide qué hacer con el cambio. */
  @Input() value: MapaTab = 'mapat';
  @Output() valueChange = new EventEmitter<MapaTab>();

  onChange(ev: any) {
    const v = ev?.detail?.value as MapaTab;
    if (v && v !== this.value) {
      this.valueChange.emit(v);
    }
  }
}
