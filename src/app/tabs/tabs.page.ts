import { Component } from '@angular/core';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss']
})
export class TabsPage {

  home: string;
  temperaturas: string;
  lluvias: string;
  heladas: string;
  eventos: string;
  logo: string;

  constructor() {
    this.home = '../../assets/tab-icons/btnHome.png';
    this.temperaturas = '../../assets/tab-icons/btnTemperaturas.png';
    this.lluvias = '../../assets/tab-icons/btnLluvias.png';
    this.heladas = '../../assets/tab-icons/btnHeladas.png';
    this.eventos = '../../assets/tab-icons/btnEventos.png';
    this.logo = '../../assets/logo-agromet.png';
  }

}
