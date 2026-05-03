import { Component, HostListener } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Header } from './header/header';
import { Footer } from './footer/footer';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, Header, Footer],
  template: `
    <app-header></app-header>
    <router-outlet></router-outlet>
    <app-footer></app-footer>
  `
})
export class App {
  private activeBentoSurface?: HTMLElement;
  private readonly bentoSelector = [
    '.card',
    '.stat-card',
    '.form-embed-shell',
    '.map-shell',
    '.responsive-img'
  ].join(',');

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent): void {
    const surface = (event.target as Element | null)?.closest(this.bentoSelector) as HTMLElement | null;

    if (!surface) {
      this.clearActiveBentoSurface();
      return;
    }

    this.activeBentoSurface = surface;
    const rect = surface.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const relativeX = (x / rect.width) * 100;
    const relativeY = (y / rect.height) * 100;
    const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -3;
    const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 3;
    const magnetX = (x - rect.width / 2) * 0.015;
    const magnetY = (y - rect.height / 2) * 0.015;

    surface.classList.add('magic-bento-active');
    surface.style.setProperty('--glow-x', `${relativeX}%`);
    surface.style.setProperty('--glow-y', `${relativeY}%`);
    surface.style.setProperty('--glow-intensity', '1');
    surface.style.setProperty('--bento-rotate-x', `${rotateX.toFixed(2)}deg`);
    surface.style.setProperty('--bento-rotate-y', `${rotateY.toFixed(2)}deg`);
    surface.style.setProperty('--bento-magnet-x', `${magnetX.toFixed(2)}px`);
    surface.style.setProperty('--bento-magnet-y', `${magnetY.toFixed(2)}px`);
  }

  @HostListener('document:mouseleave')
  onDocumentMouseLeave(): void {
    this.clearActiveBentoSurface();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const surface = (event.target as Element | null)?.closest(this.bentoSelector) as HTMLElement | null;
    if (!surface) return;

    const rect = surface.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const maxDistance = Math.max(
      Math.hypot(x, y),
      Math.hypot(x - rect.width, y),
      Math.hypot(x, y - rect.height),
      Math.hypot(x - rect.width, y - rect.height)
    );
    const ripple = document.createElement('span');

    ripple.className = 'magic-ripple';
    ripple.style.width = `${maxDistance * 2}px`;
    ripple.style.height = `${maxDistance * 2}px`;
    ripple.style.left = `${x - maxDistance}px`;
    ripple.style.top = `${y - maxDistance}px`;
    surface.appendChild(ripple);
    window.setTimeout(() => ripple.remove(), 760);
  }

  private clearActiveBentoSurface(): void {
    if (!this.activeBentoSurface) return;

    this.activeBentoSurface.classList.remove('magic-bento-active');
    this.activeBentoSurface.style.setProperty('--glow-intensity', '0');
    this.activeBentoSurface.style.setProperty('--bento-rotate-x', '0deg');
    this.activeBentoSurface.style.setProperty('--bento-rotate-y', '0deg');
    this.activeBentoSurface.style.setProperty('--bento-magnet-x', '0px');
    this.activeBentoSurface.style.setProperty('--bento-magnet-y', '0px');
    this.activeBentoSurface = undefined;
  }
}
