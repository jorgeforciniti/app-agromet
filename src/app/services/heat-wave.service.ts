// src/app/services/heat-wave.service.ts
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface DailyObservation {
  date: string;
  tmax: number;
  tmin: number;
}

export interface DailyThresholds {
  p90Min: number;
  p90Max: number;
  p10Min: number;
  p10Max: number;
}

export interface HeatWaveDay {
  date: string;
  tmax: number;
  tmin: number;
  thresholdMax: number;
  thresholdMin: number;
}

export interface HeatWave {
  startDate: string;
  endDate: string;
  consecutiveDays: number;
  days: HeatWaveDay[];
}

export interface ColdWaveDay {
  date: string;
  tmax: number;
  tmin: number;
  thresholdMin: number;
}

export interface ColdWave {
  startDate: string;
  endDate: string;
  consecutiveDays: number;
  days: ColdWaveDay[];
}

export interface WarmNight {
  date: string;
  tmin: number;
  thresholdMin: number;
}

export interface HealthRiskSummary {
  level: 'bajo' | 'moderado' | 'alto' | 'muy alto';
  label: string;
  message: string;
  triggers?: string[];
}

@Injectable({
  providedIn: 'root',
})
export class HeatWaveService {
  private percentilesUrl = 'assets/data/percentil_Termico_1990_2024.csv';

  private monthNumberToAbbrev: Record<number, string> = {
    1: 'ene',
    2: 'feb',
    3: 'mar',
    4: 'abr',
    5: 'may',
    6: 'jun',
    7: 'jul',
    8: 'ago',
    9: 'sept',
    10: 'oct',
    11: 'nov',
    12: 'dic',
  };

  constructor(private http: HttpClient) { }

  loadPercentiles(): Observable<Record<string, DailyThresholds>> {
    return this.http.get(this.percentilesUrl, { responseType: 'text' }).pipe(
      map((csv: string) => this.parsePercentileCsv(csv))
    );
  }

  private parsePercentileCsv(csv: string): Record<string, DailyThresholds> {
    return csv
      .replace(/^\uFEFF/, '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('Día'))
      .reduce((acc, line) => {
        const separator = line.includes(';') ? ';' : ',';
        const [day, p90Min, p90Max, p10Min, p10Max] = line.split(separator);

        if (day && p90Min && p90Max && p10Min && p10Max) {
          acc[day.trim()] = {
            p90Min: parseFloat(p90Min),
            p90Max: parseFloat(p90Max),
            p10Min: parseFloat(p10Min),
            p10Max: parseFloat(p10Max),
          };
        }

        return acc;
      }, {} as Record<string, DailyThresholds>);
  }

  getDayKey(dateValue: string | Date): string {
    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
    const day = date.getDate();
    const month = this.monthNumberToAbbrev[date.getMonth() + 1];
    return `${day}-${month}`;
  }

  getThresholdsForDate(
    dateValue: string | Date,
    thresholdsMap: Record<string, DailyThresholds>
  ): DailyThresholds | null {
    const key = this.getDayKey(dateValue);
    return thresholdsMap[key] ?? null;
  }

  private isNextDay(prevDate: string, nextDate: string): boolean {
    const prev = new Date(prevDate);
    const next = new Date(nextDate);
    const prevUTC = Date.UTC(prev.getFullYear(), prev.getMonth(), prev.getDate());
    const nextUTC = Date.UTC(next.getFullYear(), next.getMonth(), next.getDate());
    return nextUTC - prevUTC === 24 * 60 * 60 * 1000;
  }

  findHeatWaves(
    observations: DailyObservation[],
    thresholdsMap: Record<string, DailyThresholds>
  ): HeatWave[] {
    const processed = observations
      .map((obs) => {
        const thresholds = this.getThresholdsForDate(obs.date, thresholdsMap);
        return thresholds
          ? {
            date: obs.date,
            tmax: obs.tmax,
            tmin: obs.tmin,
            thresholdMax: thresholds.p90Max,
            thresholdMin: thresholds.p90Min,
          }
          : null;
      })
      .filter((item): item is HeatWaveDay => item !== null)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const waves: HeatWave[] = [];
    let current: HeatWave | null = null;

    for (const day of processed) {
      const isHot = day.tmax > day.thresholdMax;

      if (!isHot) {
        if (current && current.consecutiveDays >= 3) {
          waves.push(current);
        }
        current = null;
        continue;
      }

      if (
        current &&
        this.isNextDay(current.days[current.days.length - 1].date, day.date)
      ) {
        current.days.push(day);
        current.consecutiveDays++;
        current.endDate = day.date;
      } else {
        if (current && current.consecutiveDays >= 3) {
          waves.push(current);
        }

        current = {
          startDate: day.date,
          endDate: day.date,
          consecutiveDays: 1,
          days: [day],
        };
      }
    }

    if (current && current.consecutiveDays >= 3) {
      waves.push(current);
    }

    return waves;
  }

  findColdWaves(
    observations: DailyObservation[],
    thresholdsMap: Record<string, DailyThresholds>
  ): ColdWave[] {
    const processed = observations
      .map((obs) => {
        const thresholds = this.getThresholdsForDate(obs.date, thresholdsMap);
        return thresholds
          ? {
            date: obs.date,
            tmax: obs.tmax,
            tmin: obs.tmin,
            thresholdMin: thresholds.p10Min,
          }
          : null;
      })
      .filter((item): item is ColdWaveDay => item !== null)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const waves: ColdWave[] = [];
    let current: ColdWave | null = null;

    for (const day of processed) {
      const isCold = day.tmin < day.thresholdMin;

      if (!isCold) {
        if (current && current.consecutiveDays >= 3) {
          waves.push(current);
        }
        current = null;
        continue;
      }

      if (
        current &&
        this.isNextDay(current.days[current.days.length - 1].date, day.date)
      ) {
        current.days.push(day);
        current.consecutiveDays++;
        current.endDate = day.date;
      } else {
        if (current && current.consecutiveDays >= 3) {
          waves.push(current);
        }

        current = {
          startDate: day.date,
          endDate: day.date,
          consecutiveDays: 1,
          days: [day],
        };
      }
    }

    if (current && current.consecutiveDays >= 3) {
      waves.push(current);
    }

    return waves;
  }

  findWarmNights(
    observations: DailyObservation[],
    thresholdsMap: Record<string, DailyThresholds>
  ): WarmNight[] {
    return observations
      .map((obs) => {
        const thresholds = this.getThresholdsForDate(obs.date, thresholdsMap);
        if (!thresholds) return null;

        return obs.tmin > thresholds.p90Min
          ? {
            date: obs.date,
            tmin: obs.tmin,
            thresholdMin: thresholds.p90Min,
          }
          : null;
      })
      .filter((item): item is WarmNight => item !== null)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  getHeatStressRisk(
    tmaxToday: number,
    tminToday: number,
    tempNow: number,
    humidity: number,
    thresholds: DailyThresholds | null,
    activeHeatWave: HeatWave | null
  ): HealthRiskSummary {
    if (!thresholds) {
      return {
        level: 'bajo',
        label: 'Sin evaluación',
        message: 'No se pudieron cargar los umbrales climatológicos diarios.',
        triggers: [],
      };
    }

    const triggers: string[] = [];

    const hotDay = tmaxToday > thresholds.p90Max;
    const warmNight = tminToday > thresholds.p90Min;
    const hotHumidNow = tempNow >= 26 && humidity >= 75;

    if (hotDay) triggers.push('Tmax superior al P90 diario');
    if (warmNight) triggers.push('Tmin superior al P90 diario');
    if (hotHumidNow) triggers.push('Ambiente actual cálido y húmedo');

    if (activeHeatWave) {
      return {
        level: 'muy alto',
        label: 'Muy alto',
        message:
          'Se observa estrés por calor muy alto, asociado a una ola de calor en curso.',
        triggers,
      };
    }

    if (triggers.length >= 3) {
      return {
        level: 'muy alto',
        label: 'Muy alto',
        message:
          'Se observan múltiples factores simultáneos que favorecen el estrés por calor.',
        triggers,
      };
    }

    if (triggers.length === 2) {
      return {
        level: 'alto',
        label: 'Alto',
        message:
          'Se observan dos factores concurrentes que aumentan el estrés por calor.',
        triggers,
      };
    }

    if (triggers.length === 1) {
      return {
        level: 'moderado',
        label: 'Moderado',
        message:
          'Se observa un factor ambiental que puede aumentar el estrés por calor.',
        triggers,
      };
    }

    return {
      level: 'bajo',
      label: 'Bajo',
      message:
        'No se observan señales destacadas de estrés por calor para la fecha evaluada.',
      triggers: [],
    };
  }

  getColdStressRisk(
    tminToday: number,
    tempNow: number,
    thresholds: DailyThresholds | null,
    activeColdWave: ColdWave | null
  ): HealthRiskSummary {
    if (!thresholds) {
      return {
        level: 'bajo',
        label: 'Sin evaluación',
        message: 'No se pudieron cargar los umbrales climatológicos diarios.',
        triggers: [],
      };
    }

    const triggers: string[] = [];

    const coldNight = tminToday < thresholds.p10Min;
    const coldNow = tempNow <= 10;

    if (coldNight) triggers.push('Tmin inferior al P10 diario');
    if (coldNow) triggers.push('Temperatura actual baja');

    if (activeColdWave) {
      return {
        level: 'muy alto',
        label: 'Muy alto',
        message:
          'Se observa estrés por frío muy alto, asociado a una ola de frío en curso.',
        triggers,
      };
    }

    if (triggers.length >= 2) {
      return {
        level: 'alto',
        label: 'Alto',
        message:
          'Se observan factores concurrentes que aumentan el estrés por frío.',
        triggers,
      };
    }

    if (triggers.length === 1) {
      return {
        level: 'moderado',
        label: 'Moderado',
        message:
          'Se observa un factor ambiental que puede aumentar el estrés por frío.',
        triggers,
      };
    }

    return {
      level: 'bajo',
      label: 'Bajo',
      message:
        'No se observan señales destacadas de estrés por frío para la fecha evaluada.',
      triggers: [],
    };
  }

  getHumidityCategory(temp: number, humidity: number): string {
    if (humidity >= 85) return 'Muy húmedo';
    if (humidity >= 70) return 'Húmedo';
    if (humidity <= 35) return 'Seco';
    return 'Confortable';
  }

  getVectorFavorability(
    temp: number,
    humidity: number,
    rainToday: number,
    forecastRainNext24h: number
  ): HealthRiskSummary {
    const warmEnough = temp >= 22;
    const humidEnough = humidity >= 60;
    const wetEnough = rainToday > 0 || forecastRainNext24h > 0;

    if (warmEnough && humidEnough && wetEnough) {
      return {
        level: 'alto',
        label: 'Alta favorabilidad',
        message:
          'Las condiciones ambientales resultan favorables para la actividad y persistencia de mosquitos. Este indicador no reemplaza la vigilancia entomológica ni epidemiológica.',
      };
    }

    if ((warmEnough && humidEnough) || (humidEnough && wetEnough)) {
      return {
        level: 'moderado',
        label: 'Favorabilidad moderada',
        message:
          'Se observan condiciones parcialmente favorables para vectores, especialmente si la situación persiste varios días.',
      };
    }

    return {
      level: 'bajo',
      label: 'Baja favorabilidad',
      message:
        'No se observan condiciones destacadas de favorabilidad ambiental para vectores.',
    };
  }
}