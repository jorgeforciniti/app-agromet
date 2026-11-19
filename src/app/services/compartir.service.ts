import { Injectable } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { ToastController } from '@ionic/angular';

/** Atribución de la web (agromet-web: shared/fuente.ts): va siempre en la imagen compartida */
export const FUENTE_NOMBRE = 'Sección Agrometeorología-EEAOC';
export const FUENTE_TEXTO = `Fuente: ${FUENTE_NOMBRE} · agromet.eeaoc.gob.ar`;

/**
 * Plugins nativos @capacitor/filesystem y @capacitor/share (v6), registrados por nombre para no
 * depender de sus tipos: el WebView de Android no tiene navigator.share, así que en el celular la
 * imagen se guarda en la caché y se abre el menú de compartir del sistema (WhatsApp, etc.).
 * Para que funcionen hay que instalarlos (npm i @capacitor/share@6 @capacitor/filesystem@6) y
 * hacer `npx cap sync`.
 */
const Filesystem = registerPlugin<{
  writeFile(o: { path: string; data: string; directory: string }): Promise<{ uri: string }>;
}>('Filesystem');
const Share = registerPlugin<{
  share(o: { title?: string; text?: string; files?: string[]; dialogTitle?: string }): Promise<unknown>;
}>('Share');

export interface ImagenACompartir {
  /** «Lluvia diaria (últimos 30 días)» */
  titulo: string;
  /** «Estación Famaillá · 17/11/2026» */
  subtitulo?: string;
  /** Gráfico (canvas de Chart.js) o URL de una imagen con CORS abierto */
  imagen: HTMLCanvasElement | string;
  /** Líneas de referencia debajo de la imagen */
  notas?: string[];
  /** Fuente de la imagen cuando no es de la Sección (va antes de la de la Sección) */
  fuenteImagen?: string;
  /** Anillo amarillo en el centro (Satélite: San Miguel de Tucumán) */
  marcarCentro?: boolean;
  /** Barra de colores con sus extremos (Satélite: Sandwich) */
  escala?: { colores: string[]; desde: string; hasta: string };
  /** Muestra de color para la primera nota (Satélite: rayos) */
  colorNota?: string;
  /** Base del nombre del archivo; se le agrega la fecha */
  nombre: string;
  /** PNG para gráficos; JPEG para fotos satelitales (pesan mucho menos) */
  formato?: 'png' | 'jpeg';
}

const ANCHO = 1080;
const MARGEN = 48;
const FONDO_ARRIBA = '#071a24';
const FONDO_ABAJO = '#061018';
const TEXTO = '#e2e2e2';
const APAGADO = 'rgba(226, 226, 226, 0.72)';
const ACENTO = 'rgb(128, 227, 211)';
const LETRA = 'helveticaNR, "Helvetica Neue", Arial, sans-serif';
const LETRA_TITULO = 'helveticaNBC, "Helvetica Neue", Arial, sans-serif';

/**
 * Compartir un gráfico o la imagen satelital como imagen, con título, estación, fecha y la fuente
 * de la Sección (misma regla que el PNG de la web: la fuente va siempre en la imagen).
 */
@Injectable({ providedIn: 'root' })
export class CompartirService {

  constructor(private toastCtrl: ToastController) { }

  async compartir(o: ImagenACompartir): Promise<void> {
    let dataUrl = '';
    let archivo = '';
    try {
      const lienzo = await this.componer(o);
      const formato = o.formato || 'png';
      archivo = `${o.nombre}_${fechaArchivo(new Date())}.${formato === 'png' ? 'png' : 'jpg'}`;
      dataUrl = lienzo.toDataURL(`image/${formato}`, 0.9);
      const texto = `${o.titulo}${o.subtitulo ? ` · ${o.subtitulo}` : ''}\n${FUENTE_TEXTO}`;

      if (Capacitor.isNativePlatform()) {
        const { uri } = await Filesystem.writeFile({ path: archivo, data: dataUrl.split(',')[1], directory: 'CACHE' });
        await Share.share({ title: o.titulo, text: texto, files: [uri], dialogTitle: 'Compartir' });
        return;
      }

      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], archivo, { type: blob.type });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: o.titulo, text: texto } as ShareData);
        return;
      }
    } catch (e) {
      // Cerrar el menú sin elegir no es un error
      const mensaje = String((e as Error)?.message || e);
      if ((e as Error)?.name === 'AbortError' || /cancel/i.test(mensaje)) return;
      console.error('No se pudo compartir la imagen', e);
      if (!dataUrl || Capacitor.isNativePlatform()) {
        const toast = await this.toastCtrl.create({ message: 'No se pudo compartir la imagen.', duration: 2500 });
        await toast.present();
        return;
      }
    }

    // Navegador sin Web Share con archivos: se descarga
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = archivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  private async componer(o: ImagenACompartir): Promise<HTMLCanvasElement> {
    const origen = typeof o.imagen === 'string' ? await cargarImagen(o.imagen) : o.imagen;
    const anchoUtil = ANCHO - 2 * MARGEN;
    const altoImagen = Math.round(anchoUtil * origen.height / origen.width);

    // Primero se mide todo con un contexto auxiliar para saber el alto total
    const medidor = document.createElement('canvas').getContext('2d')!;
    medidor.font = `bold 46px ${LETRA_TITULO}`;
    const titulo = partirLineas(medidor, o.titulo, anchoUtil);
    medidor.font = `30px ${LETRA}`;
    const subtitulo = o.subtitulo ? partirLineas(medidor, o.subtitulo, anchoUtil) : [];
    medidor.font = `28px ${LETRA}`;
    const sangria = o.colorNota ? 34 : 0;
    const notas = (o.notas || []).map((n, i) => partirLineas(medidor, n, anchoUtil - (i === 0 ? sangria : 0)));
    medidor.font = `24px ${LETRA}`;
    const fuentes = [o.fuenteImagen, FUENTE_TEXTO].filter(Boolean).map(f => partirLineas(medidor, f!, anchoUtil));

    let alto = MARGEN + titulo.length * 54 + subtitulo.length * 38 + 24 + altoImagen;
    if (o.escala) alto += 24 + 22 + 36;
    notas.forEach(n => alto += 14 + n.length * 36);
    alto += 32 + 2 + fuentes.reduce((s, f) => s + f.length * 32, 0) + MARGEN;

    const lienzo = document.createElement('canvas');
    lienzo.width = ANCHO;
    lienzo.height = Math.round(alto);
    const ctx = lienzo.getContext('2d')!;
    const fondo = ctx.createLinearGradient(0, 0, 0, lienzo.height);
    fondo.addColorStop(0, FONDO_ARRIBA);
    fondo.addColorStop(1, FONDO_ABAJO);
    ctx.fillStyle = fondo;
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.textBaseline = 'top';

    let y = MARGEN;
    ctx.fillStyle = TEXTO;
    ctx.font = `bold 46px ${LETRA_TITULO}`;
    titulo.forEach(l => { ctx.fillText(l, MARGEN, y); y += 54; });
    ctx.fillStyle = APAGADO;
    ctx.font = `30px ${LETRA}`;
    subtitulo.forEach(l => { ctx.fillText(l, MARGEN, y); y += 38; });
    y += 24;

    ctx.drawImage(origen, MARGEN, y, anchoUtil, altoImagen);
    if (o.marcarCentro) {
      ctx.strokeStyle = 'rgb(255, 196, 0)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(MARGEN + anchoUtil / 2, y + altoImagen / 2, 14, 0, 2 * Math.PI);
      ctx.stroke();
    }
    y += altoImagen;

    if (o.escala) {
      y += 24;
      const barra = ctx.createLinearGradient(MARGEN, 0, MARGEN + anchoUtil, 0);
      o.escala.colores.forEach((c, i) => barra.addColorStop(i / (o.escala!.colores.length - 1), c));
      ctx.fillStyle = barra;
      ctx.fillRect(MARGEN, y, anchoUtil, 16);
      y += 22;
      ctx.fillStyle = TEXTO;
      ctx.font = `26px ${LETRA}`;
      ctx.textAlign = 'left';
      ctx.fillText(o.escala.desde, MARGEN, y);
      ctx.textAlign = 'right';
      ctx.fillText(o.escala.hasta, MARGEN + anchoUtil, y);
      ctx.textAlign = 'left';
      y += 36;
    }

    ctx.font = `28px ${LETRA}`;
    notas.forEach((n, i) => {
      y += 14;
      const x = MARGEN + (i === 0 ? sangria : 0);
      if (i === 0 && o.colorNota) {
        ctx.fillStyle = o.colorNota;
        ctx.fillRect(MARGEN, y + 6, 22, 22);
      }
      ctx.fillStyle = TEXTO;
      n.forEach(l => { ctx.fillText(l, x, y); y += 36; });
    });

    y += 32;
    ctx.fillStyle = ACENTO;
    ctx.fillRect(MARGEN, y - 16, 64, 2);
    y += 2;
    ctx.fillStyle = APAGADO;
    ctx.font = `24px ${LETRA}`;
    fuentes.forEach(f => f.forEach(l => { ctx.fillText(l, MARGEN, y); y += 32; }));

    return lienzo;
  }
}

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
    img.src = url;
  });
}

/** Corta el texto en renglones que entren en el ancho */
function partirLineas(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of texto.split(' ')) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (actual && ctx.measureText(prueba).width > ancho) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** «2026-11-17» en la hora del celular */
function fechaArchivo(d: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** «17/11/2026» para el subtítulo */
export function fechaHoy(): string {
  return new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
