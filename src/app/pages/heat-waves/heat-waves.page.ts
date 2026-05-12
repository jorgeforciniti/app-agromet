// src/app/pages/heat-waves/heat-waves.page.ts
import { Component, OnDestroy, OnInit } from '@angular/core';
import { EstacionesService } from '../../services/estaciones.service';
import {
  ColdWave,
  DailyObservation,
  DailyThresholds,
  HeatWave,
  HeatWaveService,
  HealthRiskSummary,
  WarmNight,
} from '../../services/heat-wave.service';

interface ForecastDaySummary {
  date: string;
  tmax: number;
  tmin: number;
  humidityMax: number;
  humidityMin: number;
  rain: number;
  popMax: number;
}

@Component({
  selector: 'app-heat-waves',
  templateUrl: './heat-waves.page.html',
  styleUrls: ['./heat-waves.page.scss'],
})
export class HeatWavesPage implements OnInit, OnDestroy {
  readonly stationId = 2049;
  readonly stationName = 'El Colmenar';
  readonly locationName = 'San Miguel de Tucumán';
  readonly smnAreaId = 3373;

  coldWaves: ColdWave[] = [];
  activeColdWave: ColdWave | null = null;

  loading = false;
  error = '';
  private refreshIntervalMs = 10 * 60 * 1000;
private refreshTimer: any = null;

  currentData: any = null;
  thresholdsToday: DailyThresholds | null = null;

  observations30d: DailyObservation[] = [];
  heatWaves: HeatWave[] = [];
  activeHeatWave: HeatWave | null = null;
  warmNights: WarmNight[] = [];

  forecastDays: ForecastDaySummary[] = [];
  smnAlert: any = null;

  heatStressRisk: HealthRiskSummary | null = null;
  coldStressRisk: HealthRiskSummary | null = null;
  vectorRisk: HealthRiskSummary | null = null;

  humidityCategory = '';
  forecastRainNext24h = 0;

  constructor(
    private estacionesService: EstacionesService,
    private heatWaveService: HeatWaveService
  ) { }

  async ngOnInit() {
  await this.loadHealthData();
  this.startAutoRefresh();
}

ngOnDestroy() {
  this.stopAutoRefresh();
}

private startAutoRefresh() {
  this.stopAutoRefresh();

  this.refreshTimer = setInterval(() => {
    this.loadHealthData();
  }, this.refreshIntervalMs);
}

private stopAutoRefresh() {
  if (this.refreshTimer) {
    clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }
}

  private async loadHealthData() {
  if (this.loading) {
    return;
  }

  this.loading = true;
  this.error = '';

    try {
      const thresholdsMap = await this.heatWaveService.loadPercentiles().toPromise();

      const currentData = await this.estacionesService
        .getDatos(this.stationId)
        .toPromise();

      if (!currentData) {
        throw new Error('No se pudo obtener el dato actual de la estación.');
      }

      this.currentData = currentData;
      this.thresholdsToday = this.heatWaveService.getThresholdsForDate(
        currentData.fecha_I,
        thresholdsMap
      );

      const temperaturesResponse = await this.estacionesService
        .getTemperatura24(this.stationId)
        .toPromise();

      const dailySeries = Array.isArray(temperaturesResponse?.[1])
        ? temperaturesResponse[1]
        : [];

      this.observations30d = dailySeries
        .map((d: any) => ({
          date: d.fecha,
          tmax: Number(d.t_max),
          tmin: Number(d.t_min),
        }))
        .filter((d: DailyObservation) => !isNaN(d.tmax) && !isNaN(d.tmin));

      this.heatWaves = this.heatWaveService.findHeatWaves(
        this.observations30d,
        thresholdsMap
      );

      this.coldWaves = this.heatWaveService.findColdWaves(
        this.observations30d,
        thresholdsMap
      );

      this.activeHeatWave = this.getActiveHeatWave();
      this.activeColdWave = this.getActiveColdWave();

      this.warmNights = this.heatWaveService.findWarmNights(
        this.observations30d,
        thresholdsMap
      );

      const pronostico = await this.estacionesService
        .getPronostico(Number(currentData.lat), Number(currentData.lon))
        .toPromise();

      this.forecastDays = this.buildForecastDays(pronostico?.list ?? []);
      this.forecastRainNext24h = this.sumForecastRainNext24h(pronostico?.list ?? []);

      this.smnAlert = await this.estacionesService
        .getSmnAlertByArea(this.smnAreaId)
        .toPromise();

      const tmaxToday = this.getTodayTmax();
      const tminToday = this.getTodayTmin();
      const humidity = Number(currentData.hum_af) || 0;
      const tempNow = Number(currentData.temp_af) || 0;
      const rainToday = Number(currentData.RR_dia) || 0;

      this.heatStressRisk = this.heatWaveService.getHeatStressRisk(
        tmaxToday,
        tminToday,
        tempNow,
        humidity,
        this.thresholdsToday,
        this.activeHeatWave
      );

      this.coldStressRisk = this.heatWaveService.getColdStressRisk(
        tminToday,
        tempNow,
        this.thresholdsToday,
        this.activeColdWave
      );

      this.humidityCategory = this.heatWaveService.getHumidityCategory(
        tempNow,
        humidity
      );

      this.vectorRisk = this.heatWaveService.getVectorFavorability(
        tempNow,
        humidity,
        rainToday,
        this.forecastRainNext24h
      );
    } catch (err) {
      console.error(err);
      this.error = 'No se pudo cargar la pantalla de salud.';
    } finally {
      this.loading = false;
    }
  }

  private getTodayIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  getTodayObservation(): DailyObservation | undefined {
    const today = this.getTodayIsoDate();
    return this.observations30d.find((d) => d.date === today);
  }

  getTodayTmax(): number {
    return this.getTodayObservation()?.tmax ?? Number(this.currentData?.temp_af) ?? 0;
  }

  getTodayTmin(): number {
    return this.getTodayObservation()?.tmin ?? Number(this.currentData?.temp_af) ?? 0;
  }

  private getActiveHeatWave(): HeatWave | null {
    const today = this.getTodayIsoDate();
    return this.heatWaves.find((wave) => wave.endDate === today) ?? null;
  }

  private buildForecastDays(list: any[]): ForecastDaySummary[] {
    const grouped: Record<string, ForecastDaySummary> = {};

    for (const item of list) {
      const dtTxt = item?.dt_txt;
      const main = item?.main;
      if (!dtTxt || !main) continue;

      const date = dtTxt.slice(0, 10);
      const temp = Number(main.temp);
      const humidity = Number(main.humidity);
      const rain = Number(item?.rain?.['3h'] ?? 0);
      const pop = Number(item?.pop ?? 0);

      if (!grouped[date]) {
        grouped[date] = {
          date,
          tmax: temp,
          tmin: temp,
          humidityMax: humidity,
          humidityMin: humidity,
          rain: rain,
          popMax: pop,
        };
      } else {
        grouped[date].tmax = Math.max(grouped[date].tmax, temp);
        grouped[date].tmin = Math.min(grouped[date].tmin, temp);
        grouped[date].humidityMax = Math.max(grouped[date].humidityMax, humidity);
        grouped[date].humidityMin = Math.min(grouped[date].humidityMin, humidity);
        grouped[date].rain += rain;
        grouped[date].popMax = Math.max(grouped[date].popMax, pop);
      }
    }

    return Object.values(grouped).slice(0, 4);
  }

  private sumForecastRainNext24h(list: any[]): number {
    return list
      .slice(0, 8)
      .reduce((sum, item) => sum + Number(item?.rain?.['3h'] ?? 0), 0);
  }

  getHeatWaveStatusText(): string {
    if (this.activeHeatWave) {
      return `Ola de calor en curso (${this.activeHeatWave.consecutiveDays} días)`;
    }
    return 'Sin ola de calor activa';
  }

  getWarmNightStatusText(): string {
    const today = this.getTodayObservation();
    if (!today || !this.thresholdsToday) return 'Sin evaluación';

    return today.tmin > this.thresholdsToday.p90Min
      ? 'Noche cálida'
      : 'Sin noche cálida';
  }

  getSmnMaxLevel(): number | null {
    if (!Array.isArray(this.smnAlert?.warnings) || !this.smnAlert.warnings.length) {
      return null;
    }

    return Math.max(...this.smnAlert.warnings.map((w: any) => Number(w.max_level ?? 0)));
  }

  getSmnSummaryText(): string {
    const level = this.getSmnMaxLevel();

    if (level === null) {
      return 'Sin información de alerta disponible.';
    }

    if (level <= 0) {
      return 'Sin alertas meteorológicas vigentes.';
    }

    return `Alerta SMN vigente. Nivel máximo detectado: ${level}.`;
  }

  getRiskClass(level?: string | null): string {
    switch (level) {
      case 'muy alto':
        return 'risk-very-high';
      case 'alto':
        return 'risk-high';
      case 'moderado':
        return 'risk-moderate';
      default:
        return 'risk-low';
    }
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  formatShortDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
    });
  }

  asPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  getActiveColdWave(): ColdWave | null {
    const today = this.getTodayIsoDate();
    return this.coldWaves.find((wave) => wave.endDate === today) ?? null;
  }

  getColdWaveStatusText(): string {
    if (this.activeColdWave) {
      return `Ola de frío en curso (${this.activeColdWave.consecutiveDays} días)`;
    }
    return 'Sin ola de frío activa';
  }

  getHeatStressTriggersText(): string {
    return this.heatStressRisk?.triggers?.length
      ? this.heatStressRisk.triggers.join(' · ')
      : 'Sin factores destacados.';
  }

  getColdStressTriggersText(): string {
    return this.coldStressRisk?.triggers?.length
      ? this.coldStressRisk.triggers.join(' · ')
      : 'Sin factores destacados.';
  }

}