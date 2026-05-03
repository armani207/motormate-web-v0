import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  AfterViewInit,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export type CounterPlace = number | '.';

@Component({
  selector: 'app-animated-counter',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './animated-counter.html',
  styleUrl: './animated-counter.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnimatedCounterComponent implements OnChanges, AfterViewInit, OnDestroy {
  /** Displayed numeric value (can update every frame from parent). */
  @Input({ required: true }) value!: number;
  @Input() precision = 0;
  /** Digit places; use `.` for decimal point. Omit to derive from `value` + `precision`. */
  @Input() places: CounterPlace[] | null = null;

  @Input() fontSize = 48;
  @Input() padding = 0;
  @Input() gap = 8;
  @Input() borderRadius = 4;
  @Input() horizontalPadding = 8;
  @Input() textColor = 'inherit';
  @Input() fontWeight: string | number = 'bold';
  @Input() gradientHeight = 16;
  @Input() gradientFrom = 'black';
  @Input() gradientTo = 'transparent';
  /** Appended after digits (e.g. empty or future units). */
  @Input() suffix = '';

  readonly digitStrip: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  resolvedPlaces: CounterPlace[] = [1];
  /** Per-column animated digit (fractional for smooth scroll). Unused indices correspond to `.`. */
  animatedDigits: number[] = [0];
  digitHeight = 48;

  private targets: number[] = [0];
  private rafId = 0;
  private reducedMotion = false;
  private started = false;

  constructor(
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngAfterViewInit(): void {
    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.started = true;
    this.syncPlacesAndTargets(true);
    if (this.reducedMotion) {
      this.cdr.markForCheck();
    } else if (this.needsDigitAnimation()) {
      this.startRaf();
    } else {
      this.cdr.markForCheck();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.started) return;
    if (changes['value'] || changes['precision'] || changes['places']) {
      this.syncPlacesAndTargets(false);
      if (this.reducedMotion) {
        this.cdr.markForCheck();
      } else {
        if (this.needsDigitAnimation()) this.startRaf();
        this.cdr.markForCheck();
      }
    }
  }

  ngOnDestroy(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  get counterStyle(): Record<string, string | number> {
    return {
      fontSize: `${this.fontSize}px`,
      gap: `${this.gap}px`,
      borderRadius: `${this.borderRadius}px`,
      paddingLeft: `${this.horizontalPadding}px`,
      paddingRight: `${this.horizontalPadding}px`,
      color: typeof this.textColor === 'string' ? this.textColor : String(this.textColor),
      fontWeight: this.fontWeight as string | number,
      direction: 'ltr',
    };
  }

  get topGradientStyle(): Record<string, string> {
    return {
      height: `${this.gradientHeight}px`,
      background: `linear-gradient(to bottom, ${this.gradientFrom}, ${this.gradientTo})`,
    };
  }

  get bottomGradientStyle(): Record<string, string> {
    return {
      height: `${this.gradientHeight}px`,
      background: `linear-gradient(to top, ${this.gradientFrom}, ${this.gradientTo})`,
    };
  }

  translateY(index: number): string {
    const place = this.resolvedPlaces[index];
    if (place === '.') return '0px';
    const y = -this.animatedDigits[index] * this.digitHeight;
    return `${y}px`;
  }

  private syncPlacesAndTargets(resetAnimation: boolean): void {
    this.resolvedPlaces =
      this.places && this.places.length > 0
        ? [...this.places]
        : derivePlaces(this.value, this.precision);
    this.targets = this.resolvedPlaces.map((p) =>
      p === '.' ? 0 : digitAtPlace(this.value, p, this.precision)
    );
    this.digitHeight = this.fontSize + this.padding;

    const nextLen = this.targets.length;
    if (this.animatedDigits.length !== nextLen || resetAnimation) {
      this.animatedDigits = this.targets.map((t, i) => (this.resolvedPlaces[i] === '.' ? 0 : t));
    }
  }

  private startRaf(): void {
    if (this.rafId || this.reducedMotion) return;
    const spring = 0.24;
    const tick = () => {
      let moving = false;
      for (let i = 0; i < this.targets.length; i++) {
        if (this.resolvedPlaces[i] === '.') continue;
        const target = this.targets[i];
        let current = this.animatedDigits[i];
        const delta = target - current;
        if (Math.abs(delta) > 1e-6) {
          moving = true;
          current += delta * spring;
          if (Math.abs(target - current) < 0.001) current = target;
        } else {
          current = target;
        }
        this.animatedDigits[i] = current;
      }
      if (moving) {
        this.cdr.markForCheck();
        this.rafId = requestAnimationFrame(tick);
      } else {
        this.rafId = 0;
      }
    };
    this.zone.runOutsideAngular(() => {
      this.rafId = requestAnimationFrame(tick);
    });
  }

  private needsDigitAnimation(): boolean {
    for (let i = 0; i < this.targets.length; i++) {
      if (this.resolvedPlaces[i] === '.') continue;
      if (Math.abs(this.targets[i] - this.animatedDigits[i]) > 1e-4) return true;
    }
    return false;
  }
}

function normalizeNearInteger(num: number): number {
  const nearest = Math.round(num);
  const tolerance = 1e-9 * Math.max(1, Math.abs(num));
  return Math.abs(num - nearest) < tolerance ? nearest : num;
}

function digitAtPlace(value: number, place: number, precision: number): number {
  const v = precision > 0 ? Number(value.toFixed(precision)) : Math.round(value);
  const abs = Math.abs(v);
  if (place >= 1) {
    return Math.floor((abs / place) % 10);
  }
  const scaled = abs / place;
  return Math.floor(normalizeNearInteger(scaled)) % 10;
}

function derivePlaces(value: number, precision: number): CounterPlace[] {
  if (!Number.isFinite(value)) return [1];
  const rounded = precision > 0 ? Number(value.toFixed(precision)) : Math.round(value);
  const abs = Math.abs(rounded);
  const intPart = Math.floor(abs);
  let intStr = intPart.toString();
  if (intStr === '0' && abs < 1 && precision > 0) {
    intStr = '0';
  }
  const places: CounterPlace[] = [];
  for (let i = 0; i < intStr.length; i++) {
    const pow = intStr.length - 1 - i;
    places.push(10 ** pow);
  }
  if (precision > 0) {
    const frac = abs.toFixed(precision).split('.')[1] ?? '';
    if (frac.replace(/0+$/, '').length > 0) {
      places.push('.');
      for (let j = 0; j < precision; j++) {
        places.push(10 ** -(j + 1));
      }
    }
  }
  return places.length ? places : [1];
}
