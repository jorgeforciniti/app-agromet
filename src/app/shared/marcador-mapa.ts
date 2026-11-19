/**
 * Piezas comunes de los mapas de estaciones (Mapbox GL, cargado como global en index.html):
 * el valor al lado de cada punto y el popup oscuro anclado al punto. Los estilos están en global.scss
 * porque Mapbox agrega los popups fuera del componente.
 */
declare var mapboxgl: any;

/** Desde este zoom se ven los valores junto a los puntos (con menos se superponen en la capital) */
const ZOOM_VALORES = 8;

export function escaparHtml(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]
  ));
}

/** Agrega al punto (el div del marcador) una etiqueta con el valor, p. ej. «29°» o «12 mm» */
export function agregarValor(el: HTMLElement, valor: string): HTMLElement {
  // Sin tocar position: Mapbox le pone «absolute» al marcador (con «relative» los puntos se corren)
  const etiqueta = document.createElement('span');
  etiqueta.className = 'marcador-valor';
  etiqueta.textContent = valor;
  el.appendChild(etiqueta);
  return el;
}

/** Popup oscuro anclado al punto: título y filas «etiqueta: valor» (en lugar del SweetAlert a pantalla completa) */
export function popupEstacion(titulo: string, filas: Array<[string, string]>, nota?: string): any {
  const html =
    `<div class="mbxPopup"><div class="mbxTitle">${escaparHtml(titulo)}</div>` +
    filas.map(([k, v]) => `<div><b>${escaparHtml(k)}:</b> ${escaparHtml(v)}</div>`).join('') +
    (nota ? `<div class="mbxSep"></div><div class="mbxNota">${escaparHtml(nota)}</div>` : '') +
    '</div>';

  return new mapboxgl.Popup({ offset: 14, closeButton: false, maxWidth: '260px' }).setHTML(html);
}

/** Muestra u oculta los valores según el zoom (clase en el contenedor del mapa) */
export function mostrarValoresSegunZoom(map: any): void {
  const aplicar = () => map.getContainer().classList.toggle('ver-valores', map.getZoom() >= ZOOM_VALORES);
  map.on('zoom', aplicar);
  aplicar();
}
