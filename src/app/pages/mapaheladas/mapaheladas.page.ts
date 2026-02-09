import { Component, OnInit } from '@angular/core';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { Router } from '@angular/router';
import { LoadingController } from '@ionic/angular';
import swal from 'sweetalert2';

declare var mapboxgl: any;

type Modo = 'dia' | 'mes' | 'anio';

@Component({
  selector: 'app-mapaheladas',
  templateUrl: './mapaheladas.page.html',
  styleUrls: ['./mapaheladas.page.scss'],
})
export class MapaheladasPage implements OnInit {

  modo: Modo = 'dia';

  anioActual = new Date().getFullYear();
  anioAnterior = this.anioActual - 1;
  anioSeleccionado = this.anioActual;

  private map: any;
  private markers: any[] = [];

  // cache para no re-consultar si solo cambiás el selector de año
  private heladasAnioRaw: any[] = [];

  constructor(
    private datosTemperaturas: EstacionesService,
    private router: Router,
    public loadingCtrl: LoadingController
  ) { }

  ngOnInit() {
    this.initMap();
    this.cargarModo('dia');
  }

  ionViewDidEnter() {
    // por si vuelve de otra pantalla y el mapa quedó raro
    setTimeout(() => this.map?.resize?.(), 250);
  }

  private initMap() {
    // IMPORTANTE: asumimos que ya tenés configurado mapboxgl.accessToken en otro lado
    mapboxgl.accessToken = 'pk.eyJ1Ijoiam9yZ2Vmb3JjaW5pdGkiLCJhIjoiY2tkMXJmaG51MGljODMxcnlybW1uaWFhMSJ9.r5sRXgwgOL-34LRNjx0Mzg';
    this.map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [-65.25, -26.85],
      zoom: 7.2,
      pitch: 0,
      attributionControl: false,
    });
    this.map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    this.addTucumanOutline();

  }

  onModoChange() {
    this.cargarModo(this.modo);
  }


  private async cargarModo(modo: Modo) {
    const loading = await this.loadingCtrl.create({
      spinner: 'bubbles',
      translucent: true,
      cssClass: 'custom-class custom-loading',
      showBackdrop: false,
      message: 'Cargando...',
    });

    await loading.present();
    
    try {
      if (modo === 'dia') {
        this.heladasAnioRaw = [];
        this.limpiarMarkers();
        this.cargarHeladasDia();
      }

      if (modo === 'mes') {
        this.heladasAnioRaw = [];
        this.limpiarMarkers();
        this.cargarHeladasMes();
      }

      if (modo === 'anio') {
        this.limpiarMarkers();
        await this.cargarHeladasAnio(); // cachea heladasAnioRaw
        this.redibujarAnio();          // pinta según anioSeleccionado
      }
    } catch (e) {
      console.log('[MAPA HELADAS] error:', e);
      swal.fire('Error', 'No se pudo cargar el mapa de heladas.', 'error');
    } finally {
      loading.dismiss().catch(() => { });
      setTimeout(() => this.map?.resize?.(), 250);
    }
  }

  redibujarAnio() {
    if (!Array.isArray(this.heladasAnioRaw) || this.heladasAnioRaw.length === 0) return;

    const y = String(this.anioSeleccionado);
    const filtrado = this.heladasAnioRaw.filter((r: any) => String(r?.anio) === y);

    this.limpiarMarkers();
    this.pintarPuntos(filtrado, `Año ${y}`);
  }

  private cargarHeladasDia() {
    this.datosTemperaturas.getHelDia().subscribe((data: any[]) => {
      this.pintarPuntos(data || [], 'Día');
    }, _ => {
      swal.fire('Error', 'No se pudo cargar heladas del día.', 'error');
    });
  }

  private cargarHeladasMes() {
    this.datosTemperaturas.getHelMes().subscribe((data: any[]) => {
      this.pintarPuntos(data || [], 'Mes');
    }, _ => {
      swal.fire('Error', 'No se pudo cargar heladas del mes.', 'error');
    });
  }

  private cargarHeladasAnio(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.datosTemperaturas.getHelAnio().subscribe((data: any[]) => {
        this.heladasAnioRaw = data || [];

        // si el backend no trae el año actual (ej. enero), igual permitimos seleccionar
        // y el mapa mostrará vacío con leyenda.
        resolve();
      }, err => reject(err));
    });
  }

  private pintarPuntos(list: any[], titulo: string) {
    if (!Array.isArray(list)) return;

    for (const it of list) {
      const lat = Number(it?.lat);
      const lon = Number(it?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const t = it?.temperatura == null ? null : Number(it.temperatura);
      const color = this.getColorByTemp(t);

      const el = document.createElement('div');
      el.style.width = '18px';
      el.style.height = '18px';
      el.style.borderRadius = '999px';
      el.style.background = color;
      el.style.border = '2px solid rgba(255,255,255,0.85)';
      el.style.boxShadow = '0 0 14px rgba(0,0,0,0.35)';

      const nombre = String(it?.nombre ?? 'Estación');
      const alt = it?.alt != null ? `${it.alt} m` : '—';
      const dias = it?.dias != null ? String(it.dias) : '—';
      const durT = it?.duracion_t != null ? String(it.duracion_t) : '—';
      const fph = it?.fph ?? '—';
      const fuh = it?.fuh ?? '—';
      const registros = it?.registros ?? '—';

      const tText = (t == null || !Number.isFinite(t)) ? 'S/D' : `${t.toFixed(1)} °C`;

      const popupHtml = `
        <div class="mbxPopup">
        <div class="mbxTitle">${nombre}</div>
        <div><b>T mínima:</b> ${tText}</div>
        <div><b>Alt:</b> ${alt}</div>
        <div class="mbxSep"></div>
        <div><b>Días helada:</b> ${dias}</div>
        <div><b>Duración total:</b> ${durT} h</div>
        <div><b>1° helada:</b> ${fph}</div>
        <div><b>Últ. helada:</b> ${fuh}</div>
        <div><b>Registros:</b> ${registros}</div>
        </div>
        `;

      const popup = new mapboxgl.Popup({
        offset: 16,
        closeButton: false,
        maxWidth: '260px'
      }).setHTML(popupHtml);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([lon, lat])
        .setPopup(popup)
        .addTo(this.map);

      this.markers.push(marker);
    }
  }

  private limpiarMarkers() {
    for (const m of this.markers) {
      try { m.remove(); } catch { }
    }
    this.markers = [];
  }

  // Ajustá umbrales a tu criterio real
  private getColorByTemp(t: number | null): string {
    if (t == null || !Number.isFinite(t)) return 'rgba(150,150,150,0.65)'; // sin dato

    if (t > 0) return 'rgba(173, 255, 153, 0.70)';   // sin helada
    if (t > -2) return 'rgba(253, 253, 3, 0.70)';   // sin helada
    if (t > -4) return 'rgba(255, 145, 0, 0.80)';   // riesgo
    if (t > -6) return 'rgba(255, 0, 0, 0.85)';  // helada
    return 'rgba(85, 0, 0, 0.88)';              // severa
  }

  private async addTucumanOutline() {
  const sourceId = 'tucuman-limites';
  const lineLayerId = 'tucuman-outline-line';
  const fillLayerId = 'tucuman-outline-fill';

  // Si ya existe, no lo vuelvas a agregar (evita duplicados al refrescar)
  if (this.map.getLayer(lineLayerId)) this.map.removeLayer(lineLayerId);
  if (this.map.getLayer(fillLayerId)) this.map.removeLayer(fillLayerId);
  if (this.map.getSource(sourceId)) this.map.removeSource(sourceId);

  const url = new URL('../../assets/icon/limites.geojson', window.location.href).toString();
  const geojson = await fetch(url).then(r => r.json());

  this.map.addSource(sourceId, {
    type: 'geojson',
    data: geojson,
  });

  // RELLENO (muy tenue) - opcional pero recomendado para ubicar la provincia
  this.map.addLayer({
    id: fillLayerId,
    type: 'fill',
    source: sourceId,
    paint: {
      'fill-color': '#00f6ed',     // tu acento
      'fill-opacity': 0.06,        // muy suave
    },
  });

  // CONTORNO (lo principal)
  this.map.addLayer({
    id: lineLayerId,
    type: 'line',
    source: sourceId,
    paint: {
      'line-color': '#00f6ed',
      'line-width': 2.2,
      'line-opacity': 0.85,
    },
  });
}

}
