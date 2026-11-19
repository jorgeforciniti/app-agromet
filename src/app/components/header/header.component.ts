import { Component, OnInit, Input } from '@angular/core';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent implements OnInit {

  @Input() titulo: string;
  /** Adónde vuelve si no hay pantalla anterior (por ejemplo, al entrar desde una notificación) */
  @Input() volverA = '/tabs/home';

  constructor() { }

  ngOnInit() {}

}
