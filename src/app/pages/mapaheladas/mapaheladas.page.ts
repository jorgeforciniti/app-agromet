import { Component, OnInit, AfterViewInit, OnChanges, SimpleChanges, Input } from '@angular/core';
import { decimal } from '../../shared/formato';
import { agregarValor, mostrarValoresSegunZoom } from 'src/app/shared/marcador-mapa';
import { EstacionesService } from 'src/app/services/estaciones.service';
import { Router } from '@angular/router';
import { LoadingController } from '@ionic/angular';
import swal from 'sweetalert2';
import { environment } from 'src/environments/environment';
import { OwmLayerKey, setOwmLayer, capaNecesitaEstiloCalles, esperarEstiloListo, esperarMapaIdle } from 'src/app/shared/owm-weather-layer.util';

declare var mapboxgl: any;

type Modo = 'dia' | 'mes' | 'anio';

@Component({
  selector: 'app-mapaheladas',
  templateUrl: './mapaheladas.page.html',
  styleUrls: ['./mapaheladas.page.scss'],
})
export class MapaheladasPage implements OnInit, AfterViewInit, OnChanges {
  /** true cuando se lo embebe dentro de MapaPage (sin su propio ion-content). */
  @Input() embedded = false;

  /** Capa raster climática opcional (precipitación/nubes/viento/temp) superpuesta al mapa. */
  @Input() capaClima: OwmLayerKey | null = null;

  modo: Modo = 'dia';

  /** Referencias/leyenda colapsada por defecto para no tapar el mapa. */
  legendAbierta = false;

  anioActual = new Date().getFullYear();
  anioAnterior = this.anioActual - 1;
  anioSeleccionado = this.anioActual;

  private map: any;
  private markers: any[] = [];
  private estiloEsCalles = false;
  private cambiandoEstilo = false;

  private readonly ESTILO_SATELITAL = 'mapbox://styles/mapbox/satellite-streets-v12';
  private readonly ESTILO_CALLES = 'mapbox://styles/mapbox/streets-v12';

  // cache para no re-consultar si solo cambiás el selector de año
  private heladasAnioRaw: any[] = [];

  constructor(
    private datosTemperaturas: EstacionesService,
    private router: Router,
    public loadingCtrl: LoadingController
  ) { }

  ngOnInit() { }

  ngAfterViewInit() {
    this.initMap();
    this.cargarModo('dia');
  }

  ionViewDidEnter() {
    // por si vuelve de otra pantalla y el mapa quedó raro
    setTimeout(() => this.map?.resize?.(), 250);
  }

  private initMap() {
    mapboxgl.accessToken = environment.mapboxAccessToken;
    this.map = new mapboxgl.Map({
      container: 'mapHeladas',
      // Misma base, encuadre y controles que los otros tres mapas
      style: 'mapbox://styles/mapbox/satellite-streets-v11',
      center: [-65.3, -27.2],
      zoom: 7.1,
      pitch: 0,
      attributionControl: false,
    });
    this.map.addControl(new mapboxgl.NavigationControl());
    this.map.addControl(new mapboxgl.FullscreenControl());
    this.map.addControl(new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true
    }));
    mostrarValoresSegunZoom(this.map);

    this.map.on('load', () => {
      // Antes se agregaba sin esperar el estilo: fallaba en silencio y el límite provincial no aparecía
      this.addTucumanOutline();
      this.aplicarCapaClima();
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.capaClima && this.map) {
      this.aplicarCapaClima();
    }
  }

  /**
   * Precipitación y viento se ven con poco contraste sobre imagen satelital,
   * así que para esas dos capas cambiamos el mapa de fondo a estilo calles.
   *
   * Si ya hay un cambio de estilo en curso (por un click anterior), no hacemos
   * nada ahora: cuando ese cambio termine, se vuelve a llamar a este mismo
   * método, que relee this.capaClima y aplica lo más reciente. Así, clicks
   * rápidos y sucesivos convergen solos sin perderse ni quedar esperando algo
   * que capaz no llega (ver esperarEstiloListo).
   */
  private aplicarCapaClima() {
    if (!this.map || this.cambiandoEstilo) return;

    // Nunca tocamos sources/layers sin confirmar antes que el mapa ya
    // terminó de cargar su estilo (inicial o el de un cambio anterior).
    esperarEstiloListo(this.map, () => this.aplicarCapaClimaListo());
  }

  private aplicarCapaClimaListo() {
    const necesitaCalles = capaNecesitaEstiloCalles(this.capaClima);

    if (necesitaCalles !== this.estiloEsCalles) {
      this.estiloEsCalles = necesitaCalles;
      this.cambiandoEstilo = true;
      this.map.setStyle(necesitaCalles ? this.ESTILO_CALLES : this.ESTILO_SATELITAL);

      esperarMapaIdle(this.map, () => {
        this.cambiandoEstilo = false;
        this.addTucumanOutline();
        this.aplicarCapaClima();
      });
      return;
    }

    setOwmLayer(this.map, this.capaClima);
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

      // Aro de color como los marcadores de los otros mapas
      const el = document.createElement('div');
      el.style.width = '20px';
      el.style.height = '20px';
      el.style.boxSizing = 'border-box';
      el.style.borderRadius = '999px';
      el.style.background = 'rgba(0,0,0,0.25)';
      el.style.border = `4px solid ${color}`;
      el.style.boxShadow = '0 0 8px rgba(0,0,0,0.45)';

      const nombre = String(it?.nombre ?? 'Estación');
      const alt = it?.alt != null ? `${it.alt} m` : '—';
      const dias = it?.dias != null ? String(it.dias) : '—';
      const durT = it?.duracion_t != null ? String(it.duracion_t) : '—';
      const fph = it?.fph ?? '—';
      const fuh = it?.fuh ?? '—';
      const registros = it?.registros ?? '—';

      const tText = (t == null || !Number.isFinite(t)) ? 'S/D' : `${decimal(t, 1)} °C`;
      if (t != null && Number.isFinite(t)) agregarValor(el, `${decimal(t, 1)}°`);

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

  // Misma escala y colores que la pantalla Heladas (nivelPorTemp y .chip de heladas.page.scss)
  private getColorByTemp(t: number | null): string {
    if (t == null || !Number.isFinite(t)) return 'rgb(150, 150, 150)'; // sin dato

    if (t > 0) return 'rgb(120, 255, 170)';   // sin helada
    if (t > -2) return 'rgb(255, 255, 153)';  // suave
    if (t > -4) return 'rgb(255, 153, 0)';    // moderada
    if (t > -6) return 'rgb(255, 0, 0)';      // severa
    return 'rgb(140, 0, 0)';                  // muy severa
  }

  private async addTucumanOutline() {
  const sourceId = 'tucuman-limites';
  const lineLayerId = 'tucuman-outline-line';

  // Si ya existe, no lo vuelvas a agregar (evita duplicados al refrescar)
  if (this.map.getLayer(lineLayerId)) this.map.removeLayer(lineLayerId);
  if (this.map.getSource(sourceId)) this.map.removeSource(sourceId);

  const url = new URL('../../assets/icon/limites.geojson', window.location.href).toString();
  const geojson = await fetch(url).then(r => r.json());

  this.map.addSource(sourceId, {
    type: 'geojson',
    data: geojson,
  });

  // Solo contorno, sin relleno (consistente con el resto de los mapas).
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
