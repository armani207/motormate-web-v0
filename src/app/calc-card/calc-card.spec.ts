import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { CalcCardComponent } from './calc-card';
import { PopulationWsService } from '../services/population-ws.service';
import { WorldPopData } from '../models/allmodels';

describe('CalcCard', () => {
  let component: CalcCardComponent;
  let fixture: ComponentFixture<CalcCardComponent>;

  beforeEach(async () => {
    const populationWsService = jasmine.createSpyObj<PopulationWsService>(
      'PopulationWsService',
      ['connect', 'disconnect'],
      {
        data$: new BehaviorSubject<WorldPopData | null>(null),
        isUsingFallback$: new BehaviorSubject(false)
      }
    );

    await TestBed.configureTestingModule({
      imports: [CalcCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: PopulationWsService, useValue: populationWsService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CalcCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
