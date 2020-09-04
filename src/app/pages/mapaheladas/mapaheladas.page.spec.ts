import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { MapaheladasPage } from './mapaheladas.page';

describe('MapaheladasPage', () => {
  let component: MapaheladasPage;
  let fixture: ComponentFixture<MapaheladasPage>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ MapaheladasPage ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(MapaheladasPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
