import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LiveCounterComponent } from '../../components/live-counter/live-counter';
import { CpImpactMapComponent } from '../../components/cp-impact-map/cp-impact-map';
import { FloatingLinesComponent } from '../../components/floating-lines/floating-lines';

@Component({
  selector: 'app-home',
  imports: [
    CommonModule,
    RouterLink,
    LiveCounterComponent,
    CpImpactMapComponent,
    FloatingLinesComponent,
  ],
  templateUrl: './home.html',
})
export class Home {
  readonly cpBirthRatePerSecond = 1 / 120;
  readonly globalCpPopulation = 17_000_000;
  readonly usChildrenWithCp = 213_000;

  /** Gradient stops for hero FloatingLines (brand teal → coral). */
  readonly heroLinesGradient = ['#062334', '#0f5c7a', '#5eb8cf', '#e87461', '#c9574a'];
}
