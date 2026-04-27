import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CalcCard } from './calc-card';

describe('CalcCard', () => {
  let component: CalcCard;
  let fixture: ComponentFixture<CalcCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalcCard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CalcCard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
