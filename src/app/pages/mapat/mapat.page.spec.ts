import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { MapatPage } from './mapat.page';

describe('MapatPage', () => {
  let component: MapatPage;
  let fixture: ComponentFixture<MapatPage>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ MapatPage ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(MapatPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
