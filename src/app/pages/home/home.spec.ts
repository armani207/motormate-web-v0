import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { provideRouter, RouterLink } from '@angular/router';

import { LiveCounterComponent } from '../../components/live-counter/live-counter';
import { CpImpactMapComponent } from '../../components/cp-impact-map/cp-impact-map';

import { Home } from './home';

@Component({
  selector: 'app-floating-lines',
  standalone: true,
  template: '',
})
class FloatingLinesStub {}

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    })
      .overrideComponent(Home, {
        set: {
          imports: [
            CommonModule,
            RouterLink,
            LiveCounterComponent,
            CpImpactMapComponent,
            FloatingLinesStub,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
