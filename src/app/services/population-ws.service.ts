import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Subscription, interval } from 'rxjs';
import { WorldPopData } from '../models/allmodels';

@Injectable({ providedIn: 'root' })
export class PopulationWsService {

  public data$ = new BehaviorSubject<WorldPopData | null>(null);
  public isUsingFallback$ = new BehaviorSubject<boolean>(false);

  private ws!: WebSocket;
  private restFallbackSub!: Subscription;
  private reconnectDelay = 3000;

  constructor(private zone: NgZone) {}

  connect() {
    // 1️⃣ Load initial cached value from REST
    this.loadInitialData();

    // 2️⃣ WebSocket setup
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${protocol}://${window.location.host}/ws`);

    this.ws.onopen = () => {
      console.log('WS connected');
      this.isUsingFallback$.next(false);
      this.stopRestFallback();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data: WorldPopData = JSON.parse(event.data);
        this.zone.run(() => this.data$.next(data));
      } catch (err) {
        console.error('Error parsing WS message:', err);
      }
    };

    this.ws.onclose = () => {
      console.warn('WS closed — switching to REST fallback in 1s');
      this.activateRestFallback();
      setTimeout(() => this.connect(), this.reconnectDelay);
    };

    this.ws.onerror = (err) => {
      console.error('WS error:', err);
      this.ws.close();
    };
  }

  private async loadInitialData() {
    try {
      const res = await fetch('/api/world-population');
      const data: WorldPopData = await res.json();
      this.zone.run(() => this.data$.next(data));
    } catch (err) {
      console.error('Error loading initial data from REST:', err);
    }
  }

  private activateRestFallback() {
    if (this.restFallbackSub) return;

    this.isUsingFallback$.next(true);

    this.restFallbackSub = interval(5000).subscribe(async () => {
      try {
        const res = await fetch('/api/world-population');
        const data: WorldPopData = await res.json();
        this.zone.run(() => this.data$.next(data));
      } catch (err) {
        console.error("REST fallback error:", err);
      }
    });
  }

  private stopRestFallback() {
    if (this.restFallbackSub) {
      this.restFallbackSub.unsubscribe();
      this.restFallbackSub = undefined!;
    }
  }

  disconnect() {
    this.stopRestFallback();
    this.ws?.close();
  }
}
