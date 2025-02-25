import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})


export class EstacionesService {

  dato: any;

  constructor( private http: HttpClient ) { }

  getVersion() {
    return this.http.get('https://agromet.eeaoc.gob.ar/android/io_version.php');
  }
  getPosts() {
    return this.http.get('https://agromet.eeaoc.gob.ar/android/io_estaciones.php?habilitada=2');
  }
  getDatos() {
    return this.http.get('https://agromet.eeaoc.gob.ar/android/io_datos.php?estacion=' + localStorage.getItem('estacion'));
  }
  getTempMax() {
    return this.http.get('https://agromet.eeaoc.gob.ar/android/io_temperaturas.php?estacion=0');
  }
  getTempMin() {
    return this.http.get('https://agromet.eeaoc.gob.ar/android/io_temperaturas.php?estacion=-1');
  }
  getTemperatura24() {
    return this.http.get('https://agromet.eeaoc.gob.ar/android/io_temperaturas.php?estacion=' + localStorage.getItem('estacion'));
  }
  getRRMes() {
    return this.http.get('https://agromet.eeaoc.gob.ar/android/io_rr.php?estacion=' + localStorage.getItem('estacion'));
  }
  getRR24() {
    return this.http.get('https://agromet.eeaoc.gob.ar/android/io_rr.php?estacion=0');
  }
  getHelDia() {
    return this.http.get('https://agromet.eeaoc.gob.ar/android/io_temperaturas.php?estacion=-1');
  }
  getHelMes() {
    return this.http.get('https://agromet.eeaoc.gob.ar/android/io_temperaturas.php?estacion=-2');
  }
  getHelAnio() {
    return this.http.get('https://agromet.eeaoc.gob.ar/android/io_temperaturas.php?estacion=-3');
  }
  getNoticias() {
    return this.http.get('https://agromet.eeaoc.gob.ar/android/io_noticias.php');
  }
  getPronostico() {
    this.dato = JSON.parse(localStorage.getItem('datos'));
    return this.http.get(`https://api.openweathermap.org/data/2.5/forecast?lat=${this.dato.lat}&lon=${this.dato.lon}&lang=es&units=metric&appid=ea2faa440ccc747a20a042317dadac3f`);
  }
  getClimaActual() {
    this.dato = JSON.parse(localStorage.getItem('datos'));
    return this.http.get(`https://api.openweathermap.org/data/2.5/weather?lat=${this.dato.lat}&lon=${this.dato.lon}&lang=es&units=metric&appid=ea2faa440ccc747a20a042317dadac3f`);
  }

}

