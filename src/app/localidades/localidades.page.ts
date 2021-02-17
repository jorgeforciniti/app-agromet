import { Component, OnInit } from '@angular/core';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { Router } from '@angular/router';
import { analyzeAndValidateNgModules } from '@angular/compiler';

@Component({
  selector: 'app-localidades',
  templateUrl: './localidades.page.html',
  styleUrls: ['./localidades.page.scss'],
})
export class LocalidadesPage implements OnInit {

  mensajes: any[] = [];
  loading: any;

  constructor( private estacionesService: EstacionesService, private router: Router ) { }

  ngOnInit() {
    this.mensajes = JSON.parse(localStorage.getItem('estaciones'));
  }

  onClick( check ){
    localStorage.setItem('estacion', check.Identificacion);
    localStorage.setItem('datos', JSON.stringify(check));
    localStorage.setItem('temperatura', '1');
    localStorage.setItem('home', '1');
    localStorage.setItem('lluvia', '1');
    localStorage.setItem('helada', '1');
    this.router.navigate(['/home']);
  }
}
