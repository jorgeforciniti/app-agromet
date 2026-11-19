import { environment } from 'src/environments/environment';

export type OwmLayerKey = 'precipitation_new' | 'clouds_new' | 'wind_new' | 'temp_new';

export const OWM_LAYERS: Array<{ key: OwmLayerKey; label: string; icon: string }> = [
  { key: 'precipitation_new', label: 'Precipitación', icon: 'rainy-outline' },
  { key: 'clouds_new', label: 'Nubosidad', icon: 'cloud-outline' },
  { key: 'wind_new', label: 'Viento', icon: 'flag-outline' },
  { key: 'temp_new', label: 'Temperatura', icon: 'thermometer-outline' },
];

function sourceId(layer: OwmLayerKey): string {
  return `owm-src-${layer}`;
}

function layerId(layer: OwmLayerKey): string {
  return `owm-layer-${layer}`;
}

function tilesUrl(layer: OwmLayerKey): string {
  return `https://tile.openweathermap.org/map/${layer}/{z}/{x}/{y}.png?appid=${environment.openWeatherApiKey}`;
}

// Temperatura se ve demasiado fuerte al máximo contraste; las otras piden
// el máximo posible porque se veían muy tenues. Nubosidad va en escala de
// grises (raster-saturation: -1 le saca todo el color).
function paintFor(layer: OwmLayerKey) {
  if (layer === 'temp_new') {
    return {
      'raster-opacity': 0.7,
      'raster-contrast': 0,
      'raster-saturation': 0,
      'raster-fade-duration': 0,
    };
  }

  if (layer === 'clouds_new') {
    return {
      'raster-opacity': 0.9,
      'raster-contrast': 0,
      'raster-saturation': -1,
      'raster-fade-duration': 0,
    };
  }

  if (layer === 'wind_new') {
    return {
      'raster-opacity': 1,
      'raster-contrast': 0.55,
      'raster-saturation': 0.7,
      'raster-fade-duration': 0,
    };
  }

  return {
    'raster-opacity': 1,
    'raster-contrast': 1,
    'raster-saturation': 1,
    'raster-fade-duration': 0,
  };
}

// Cuántas veces reintentamos refrescar un source si Mapbox reporta error de
// tile (red lenta / servidor de OpenWeatherMap tardando o fallando puntual).
const REINTENTOS_MAX = 2;
const reintentosPorSource = new Map<string, number>();

/** Agrega (si no existe) la capa raster de OpenWeatherMap indicada al mapa Mapbox. */
export function addOwmLayer(map: any, layer: OwmLayerKey) {
  if (!map || typeof map.getLayer !== 'function') return;
  if (map.getLayer(layerId(layer))) return;

  const srcId = sourceId(layer);

  if (!map.getSource(srcId)) {
    map.addSource(srcId, {
      type: 'raster',
      tiles: [tilesUrl(layer)],
      tileSize: 256,
    });

    reintentosPorSource.set(srcId, 0);
    map.on('error', (e: any) => onMapError(map, e, srcId, layer));
  }

  map.addLayer({
    id: layerId(layer),
    type: 'raster',
    source: srcId,
    paint: paintFor(layer),
  });

  // Mapbox GL a veces no pide las tiles de un source recién agregado hasta
  // que hay un repintado o cambio de cámara real (por eso a veces "aparece
  // solo al hacer zoom" o recién al cambiar a OTRA capa). Un mapa que estaba
  // inactivo no siempre reacciona a un solo empujón inmediato, así que
  // insistimos de tres formas distintas en vez de confiar en una sola:
  const empujar = () => {
    map.resize?.();
    map.triggerRepaint?.();
  };

  empujar(); // ahora mismo
  setTimeout(empujar, 300); // por si el mapa todavía se estaba asentando
  map.once?.('idle', empujar); // apenas el renderer confirme que terminó de asentarse
}

/**
 * Si falla la carga de un tile de este source (servidor lento/caído, red del
 * dispositivo), forzamos un re-pedido de esa misma fuente poco después, en
 * vez de dejar ese cuadro del mapa en blanco hasta que el usuario haga zoom.
 */
function onMapError(map: any, e: any, srcId: string, layer: OwmLayerKey) {
  if (e?.sourceId !== srcId) return;

  const intentos = reintentosPorSource.get(srcId) ?? 0;
  if (intentos >= REINTENTOS_MAX) return;
  reintentosPorSource.set(srcId, intentos + 1);

  setTimeout(() => {
    const source = map.getSource?.(srcId);
    if (source?.setTiles) source.setTiles([tilesUrl(layer)]);
  }, 1500);
}

export function removeOwmLayer(map: any, layer: OwmLayerKey) {
  if (!map || typeof map.getLayer !== 'function') return;
  if (map.getLayer(layerId(layer))) map.removeLayer(layerId(layer));
  if (map.getSource(sourceId(layer))) map.removeSource(sourceId(layer));
  reintentosPorSource.delete(sourceId(layer));
}

/** Deja activa únicamente la capa indicada (o ninguna, si layer es null). */
export function setOwmLayer(map: any, layer: OwmLayerKey | null) {
  if (!map) return;
  for (const l of OWM_LAYERS) {
    if (l.key !== layer) removeOwmLayer(map, l.key);
  }
  if (layer) addOwmLayer(map, layer);
}

/**
 * Precipitación y viento se ven mal sobre imagen satelital (poco contraste);
 * para esas dos capas conviene el estilo de calles estándar en vez del satelital.
 */
export function capaNecesitaEstiloCalles(layer: OwmLayerKey | null): boolean {
  return layer === 'precipitation_new' || layer === 'wind_new';
}

/**
 * Corre `callback` una vez que la DEFINICIÓN del estilo seteado por
 * map.setStyle() está lista para aceptar addSource()/addLayer().
 *
 * Ojo: `map.isStyleLoaded()` no alcanza como única condición, porque en
 * Mapbox GL también exige que TODAS las tiles de TODOS los sources (incluidas
 * las de OpenWeatherMap, que a veces tardan o fallan) terminen de cargar. Si
 * una tile se cuelga, isStyleLoaded() nunca vuelve a true y quedaríamos
 * esperando para siempre. Por eso: 1) tomamos como señal válida el primer
 * 'styledata' cuyo dataType sea 'style' (el estilo en sí ya está listo,
 * independientemente de si sus tiles terminaron), y 2) como red de
 * seguridad, un timeout fijo que garantiza que esto nunca se quede trabado.
 */
export function esperarEstiloListo(map: any, callback: () => void) {
  let resuelto = false;

  const finalizar = () => {
    if (resuelto) return;
    resuelto = true;
    map.off('styledata', onStyleData);
    clearTimeout(timeoutId);
    callback();
  };

  const onStyleData = (e: any) => {
    if (e?.dataType === 'style' || map.isStyleLoaded?.()) finalizar();
  };

  map.on('styledata', onStyleData);
  const timeoutId = setTimeout(finalizar, 2000);

  // Puede que ya esté listo en este mismo tick (ej. si no hubo setStyle real).
  if (map.isStyleLoaded?.()) finalizar();
}

/**
 * Corre `callback` una vez que el mapa está realmente "idle" (sin pedidos de
 * tiles pendientes, no solo con la definición del estilo lista). Lo usamos
 * específicamente después de un cambio de estilo base (satelital ↔ calles):
 * el estilo "calles" trae muchas más capas propias (calles, etiquetas,
 * edificios) que la sola definición del estilo no garantiza que ya cargaron,
 * y agregar nuestra capa mientras el mapa todavía está asimilando todo eso
 * es lo que hacía que a veces no apareciera hasta la siguiente interacción.
 * Con timeout de seguridad para no quedar esperando para siempre.
 */
export function esperarMapaIdle(map: any, callback: () => void) {
  let resuelto = false;

  const finalizar = () => {
    if (resuelto) return;
    resuelto = true;
    clearTimeout(timeoutId);
    callback();
  };

  map.once?.('idle', finalizar);
  const timeoutId = setTimeout(finalizar, 3000);
}
