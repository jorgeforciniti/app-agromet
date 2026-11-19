export interface SmnAlerta {
  area: string;
  nivel: number;
  fecha: string;
  dateISO: string;
  descripcion: string;
  instruccion: string;
}

/** Extraído de HomePage: misma interpretación del payload de smn-alerta-area.php en toda la app. */
export function parseAlertasPorArea(area: string, data: any): SmnAlerta[] {
  const out: SmnAlerta[] = [];
  const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
  const reports = Array.isArray(data?.reports) ? data.reports : [];

  for (const w of warnings) {
    const moments = buildMomentsLabel(w);
    const dateISO = String(w?.date ?? '');
    const fecha = formatDateDDMMYYYY(dateISO);

    const events = Array.isArray(w?.events) ? w.events : [];
    const topEvent = events.reduce((best: any, cur: any) => {
      const a = best?.max_level ?? 0;
      const b = cur?.max_level ?? 0;
      return b > a ? cur : best;
    }, null);

    const rep = reports.find((r: any) => String(r?.event_id) === String(topEvent?.id));
    const level0 = rep?.levels?.[0] ?? null;

    out.push({
      area,
      nivel: Number(w?.max_level ?? topEvent?.max_level ?? 0),
      fecha: moments ? `${fecha} (${moments})` : fecha,
      dateISO,
      descripcion: level0?.description ?? '',
      instruccion: level0?.instruction ?? '',
    });
  }

  return out;
}

function buildMomentsLabel(warning: any): string {
  const events = Array.isArray(warning?.events) ? warning.events : [];
  const present = new Set<string>();

  for (const ev of events) {
    const lv = ev?.levels ?? {};
    if (lv.early_morning != null && Number(lv.early_morning) > 0) present.add('madrugada');
    if (lv.morning != null && Number(lv.morning) > 0) present.add('mañana');
    if (lv.afternoon != null && Number(lv.afternoon) > 0) present.add('tarde');
    if (lv.night != null && Number(lv.night) > 0) present.add('noche');
  }

  const order = ['madrugada', 'mañana', 'tarde', 'noche'];
  return order.filter((x) => present.has(x)).join(', ');
}

function formatDateDDMMYYYY(dateISO: string): string {
  if (!dateISO || dateISO.length < 10) return dateISO;
  const y = dateISO.slice(0, 4);
  const m = dateISO.slice(5, 7);
  const d = dateISO.slice(8, 10);
  return `${d}/${m}/${y}`;
}
