import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { MapathoyPage } from './mapathoy.page';

describe('MapathoyPage', () => {
  let component: MapathoyPage;
  let fixture: ComponentFixture<MapathoyPage>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ MapathoyPage ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(MapathoyPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
