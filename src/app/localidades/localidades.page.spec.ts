import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { LocalidadesPage } from './localidades.page';

describe('LocalidadesPage', () => {
  let component: LocalidadesPage;
  let fixture: ComponentFixture<LocalidadesPage>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ LocalidadesPage ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(LocalidadesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
