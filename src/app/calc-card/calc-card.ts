import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { PopulationWsService } from '../services/population-ws.service';

@Component({
  selector: 'app-calc-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calc-card.html',
  styleUrls: ['./calc-card.css']
})
export class CalcCardComponent implements OnInit, OnDestroy {

  cpPopulation = 0;
  cpBirthsToday = 0;

  private dataSub!: Subscription;
  private fallbackSub!: Subscription;

  private timers: Record<string, any> = {};
  private firstLoad = true;

  usingFallback = false;

  constructor(
    private wsService: PopulationWsService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Connect WS service (handles REST fallback internally)
    this.wsService.connect();

    // Subscribe to data updates
    this.dataSub = this.wsService.data$.subscribe((data) => {
      if (!data) return;

      const worldPop = Number(data.population.replace(/,/g, "")) || 0;
      const worldBirths = Number(data.birthsToday.replace(/,/g, "")) || 0;

      const newPopulation = Math.round((worldPop * 2) / 1000);
      const newBirths = Math.round((worldBirths * 2) / 1000);

      // First load → set instantly
      if (this.firstLoad) {
        this.cpPopulation = newPopulation;
        this.cpBirthsToday = newBirths;
        this.firstLoad = false;
        this.cdr.detectChanges();
        return;
      }

      this.animateValue('cpPopulation', this.cpPopulation, newPopulation);
      this.animateValue('cpBirthsToday', this.cpBirthsToday, newBirths);
    });

    // Subscribe to fallback mode changes
    this.fallbackSub = this.wsService.isUsingFallback$.subscribe((isFallback) => {
      this.usingFallback = isFallback;
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy(): void {
    this.dataSub?.unsubscribe();
    this.fallbackSub?.unsubscribe();
    this.wsService.disconnect();

    // Clear animation timers
    Object.values(this.timers).forEach(clearInterval);
  }

  formatLarge(n: number): string {
    if (n >= 1_000_000) return Math.round(n / 1_000_000) + 'M';
    if (n >= 1_000) return Math.round(n / 1_000) + 'K';
    return Math.round(n).toString();
  }

  private animateValue(
    key: 'cpPopulation' | 'cpBirthsToday',
    from: number,
    to: number,
    duration = 800
  ) {
    if (from === to) return;

    if (this.timers[key]) clearInterval(this.timers[key]);

    const range = to - from;
    const absRange = Math.abs(range);

    let step: number;
    if (absRange > 50000) step = 777777;
    else if (absRange > 10000) step = 333;
    else if (absRange > 1000) step = 111;
    else if (absRange > 200) step = 25;
    else if (absRange > 50) step = 5;
    else step = 1;

    const stepsNeeded = Math.ceil(absRange / step);
    const stepTime = Math.max(Math.floor(duration / stepsNeeded), 10);
    let current = from;

    this.timers[key] = setInterval(() => {
      if (current < to) current = Math.min(current + step, to);
      else current = Math.max(current - step, to);

      this[key] = current;
      this.cdr.detectChanges();

      if (current === to) {
        clearInterval(this.timers[key]);
        this.timers[key] = null;
      }
    }, stepTime);
  }
}
