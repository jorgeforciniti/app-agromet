import { TestBed } from '@angular/core/testing';

import { HeatWaveService } from './heat-wave.service';

describe('HeatWaveService', () => {
  let service: HeatWaveService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HeatWaveService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
