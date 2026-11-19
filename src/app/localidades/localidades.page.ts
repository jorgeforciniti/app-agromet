import { Component, OnInit } from '@angular/core';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { NavController } from '@ionic/angular';

@Component({
  selector: 'app-localidades',
  templateUrl: './localidades.page.html',
  styleUrls: ['./localidades.page.scss'],
})
export class LocalidadesPage implements OnInit {
  mensajes: any[] = [];

  /** Texto del buscador */
  filtro = '';

  /** Estación activa, para marcarla en la lista */
  actual: string | null = null;

  constructor(
    private estacionesService: EstacionesService,
    private navCtrl: NavController
  ) { }

  ngOnInit() {
    this.mensajes = JSON.parse(localStorage.getItem('estaciones') || '[]');
  }

  ionViewWillEnter() {
    this.actual = this.estacionesService.getSelectedStation();
  }

  idDe(estacion: any): string {
    return String(estacion?.Identificacion ?? estacion?.identificacion ?? estacion?.id ?? '');
  }

  esActual(estacion: any): boolean {
    return !!this.actual && this.idDe(estacion) === this.actual;
  }

  /** Favoritas primero (en su propia sección) y después el resto, filtradas por nombre */
  get favoritas(): any[] {
    return this.filtradas.filter(e => this.esFavorita(e));
  }

  get resto(): any[] {
    return this.filtradas.filter(e => !this.esFavorita(e));
  }

  private get filtradas(): any[] {
    const f = this.normalizar(this.filtro);
    return f ? this.mensajes.filter(e => this.normalizar(e?.nombre).includes(f)) : this.mensajes;
  }

  /** Sin mayúsculas ni tildes: «tafi» encuentra «Tafí Viejo» */
  private normalizar(s: any): string {
    return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  onClick(estacion: any) {
    const id = estacion?.Identificacion ?? estacion?.identificacion ?? estacion?.id;
    if (!id) return;

    this.estacionesService.setSelectedStation(id);

    localStorage.removeItem('datos');

    this.navCtrl.navigateBack('/tabs/home');
  }

  toggleFavorita(estacion: any, ev: Event) {
    ev.stopPropagation();
    const id = estacion?.Identificacion ?? estacion?.identificacion ?? estacion?.id;
    if (!id) return;
    this.estacionesService.toggleFavorite(id);
  }

  esFavorita(estacion: any): boolean {
    const id = estacion?.Identificacion ?? estacion?.identificacion ?? estacion?.id;
    return id ? this.estacionesService.isFavorite(id) : false;
  }
}
