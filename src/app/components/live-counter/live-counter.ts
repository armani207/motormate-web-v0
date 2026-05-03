import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { AnimatedCounterComponent } from '../animated-counter/animated-counter';

interface StoredCounter {
  value: number;
  timestamp: number;
}

@Component({
  selector: 'app-live-counter',
  standalone: true,
  imports: [AnimatedCounterComponent],
  templateUrl: './live-counter.html',
  styleUrl: './live-counter.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveCounterComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) label = '';
  @Input() description = '';
  @Input() sourceLabel = '';
  @Input() sourceUrl = '';
  @Input() sourceDetail = '';
  @Input() storageKey = '';
  @Input() initialValue = 0;
  @Input() ratePerSecond = 0;
  @Input() startFromDayStart = false;
  @Input() suffix = '';
  @Input() precision = 0;
  /** Use on dark sections (e.g. metrics band). */
  @Input() tone: 'on-light' | 'on-dark' = 'on-light';

  @ViewChild('counterRoot', { static: true }) counterRoot!: ElementRef<HTMLElement>;

  displayValue = 0;
  private targetValue = 0;
  private animationFrame = 0;
  /** Throttle change detection while counters tick continuously. */
  private tickSeq = 0;
  private observer?: IntersectionObserver;
  private isVisible = false;
  private reducedMotion = false;

  constructor(
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  ngAfterViewInit(): void {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.targetValue = this.computeCurrentValue();
    this.displayValue = this.reducedMotion ? this.targetValue : Math.max(0, this.targetValue * 0.985);
    this.cdr.markForCheck();

    this.observer = new IntersectionObserver(
      ([entry]) => {
        this.isVisible = entry.isIntersecting;
        if (this.isVisible) this.start();
        else this.stop();
      },
      { threshold: 0.25 }
    );

    this.observer.observe(this.counterRoot.nativeElement);
  }

  ngOnDestroy(): void {
    this.persist();
    this.stop();
    this.observer?.disconnect();
  }

  get roundedValue(): number {
    const factor = 10 ** this.precision;
    return Math.round(this.displayValue * factor) / factor;
  }

  /** Large rounded headline (e.g. 17M) alongside full precision — avoids cramped digits. */
  get millionsHeroEligible(): boolean {
    return (
      this.precision === 0 &&
      this.suffix === '' &&
      Math.abs(this.roundedValue) >= 1_000_000
    );
  }

  get millionsAbbrev(): string {
    const v = this.roundedValue / 1_000_000;
    const roundedTenth = Math.round(v * 10) / 10;
    if (roundedTenth >= 100) {
      return `${Math.round(v)}M`;
    }
    return `${roundedTenth}M`;
  }

  /** Pixel size for reel digits (hero cards use larger values). */
  get animatedDigitFontSize(): number {
    return this.millionsHeroEligible ? 17 : 52;
  }

  get animatedDigitPadding(): number {
    return this.millionsHeroEligible ? 2 : 4;
  }

  get animatedGap(): number {
    return this.millionsHeroEligible ? 4 : 7;
  }

  get digitTextColor(): string {
    return this.tone === 'on-dark' ? 'rgb(248 250 252)' : 'var(--brand-ink)';
  }

  get digitGradientFrom(): string {
    return this.tone === 'on-dark' ? 'rgb(12 28 42)' : 'rgb(255 255 255 / 0.98)';
  }

  private start(): void {
    if (this.animationFrame) return;

    this.zone.runOutsideAngular(() => {
      const tick = () => {
        this.targetValue = this.computeCurrentValue();

        if (this.reducedMotion) {
          this.displayValue = this.targetValue;
        } else {
          const distance = this.targetValue - this.displayValue;
          this.displayValue += Math.max(distance * 0.09, this.ratePerSecond / 60);
          if (this.displayValue > this.targetValue) this.displayValue = this.targetValue;
        }

        const keepsMoving = this.ratePerSecond > 0;
        const settled =
          !keepsMoving && Math.abs(this.targetValue - this.displayValue) < (this.precision > 0 ? 1e-4 : 0.02);
        if (settled) {
          this.displayValue = this.targetValue;
        }

        this.tickSeq++;
        const paint =
          this.reducedMotion || settled || keepsMoving === false || (this.tickSeq & 1) === 1;
        if (paint) {
          this.cdr.markForCheck();
        }

        if (!this.isVisible) {
          this.animationFrame = 0;
          return;
        }

        if (settled) {
          this.animationFrame = 0;
          return;
        }

        this.animationFrame = requestAnimationFrame(tick);
      };

      this.animationFrame = requestAnimationFrame(tick);
    });
  }

  private stop(): void {
    if (!this.animationFrame) return;
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.persist();
  }

  private computeCurrentValue(): number {
    const now = Date.now();

    if (this.startFromDayStart) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      return this.initialValue + ((now - dayStart.getTime()) / 1000) * this.ratePerSecond;
    }

    const stored = this.readStoredValue();
    if (stored) {
      return stored.value + ((now - stored.timestamp) / 1000) * this.ratePerSecond;
    }

    return this.initialValue;
  }

  private persist(): void {
    if (!this.storageKey || this.startFromDayStart) return;

    const payload: StoredCounter = {
      value: this.computeCurrentValue(),
      timestamp: Date.now(),
    };

    localStorage.setItem(this.storageKey, JSON.stringify(payload));
  }

  private readStoredValue(): StoredCounter | null {
    if (!this.storageKey) return null;

    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<StoredCounter>;
      if (typeof parsed.value !== 'number' || typeof parsed.timestamp !== 'number') return null;
      return parsed as StoredCounter;
    } catch {
      return null;
    }
  }
}
