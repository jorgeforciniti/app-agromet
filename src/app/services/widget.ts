import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Widget de la pantalla de inicio (sólo Android: android/app/src/main/java/com/agromet/app/EstacionWidget.java).
 * Muestra las estaciones favoritas o, si no hay, la elegida. El widget no ve el localStorage de la
 * app: este plugin propio (WidgetPlugin.java) le pasa las estaciones y su último registro, y el
 * widget después los actualiza solo cada 30 minutos.
 */
const AgrometWidget = registerPlugin<{
  actualizar(o: { estaciones: string[]; datos: any[] }): Promise<void>;
}>('AgrometWidget');

export function actualizarWidget(estaciones: string[], datos: any[]) {
  if (Capacitor.getPlatform() !== 'android' || !estaciones.length) return;
  // Copia: el plugin se carga después y para entonces las pantallas ya pudieron cambiar el objeto
  // (por ejemplo, Inicio estima los valores de un dato atrasado)
  const copia = JSON.parse(JSON.stringify(datos));
  AgrometWidget.actualizar({ estaciones, datos: copia }).catch(() => { /* versión sin widget */ });
}
