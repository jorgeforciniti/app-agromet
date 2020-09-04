import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { MapaRRPage } from './mapa-rr.page';

describe('MapaRRPage', () => {
  let component: MapaRRPage;
  let fixture: ComponentFixture<MapaRRPage>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ MapaRRPage ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(MapaRRPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
