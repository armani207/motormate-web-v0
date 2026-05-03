// src/app/pages/map/map.ts
import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import * as L from 'leaflet';
import { fallbackData, mapPinIcon } from '../../utils/constants';
import { CatalogEntry, Coords, CityData } from '../../models/allmodels';
import { AuthService } from '../../services/auth.service';
import { CommunityPin, PinService } from '../../services/pin.service';

@Component({
  selector: 'app-map',
  imports: [CommonModule, RouterLink],
  standalone: true,
  templateUrl: './map.html',
  styleUrls: ['./map.css']
})
export class Map implements AfterViewInit, OnDestroy {
  private map: L.Map | undefined;
  private cityCache: Record<string, Coords> = {};
  private memberLayer: L.LayerGroup | undefined;
  private communityLayer: L.LayerGroup | undefined;

  isLoading = true;
  errorMessage = '';
  loadedFromFallback = false;
  totalMembers = 0;
  totalLocations = 0;
  geocodedLocations = 0;
  communityPinCount = 0;

  citySummaries: { key: string; count: number }[] = [];
  communityPins: CommunityPin[] = [];

  protected readonly Boolean = Boolean;

  constructor(
    public readonly auth: AuthService,
    private readonly pinService: PinService
  ) {}

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = undefined;
    }
  }

  private async initMap(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    this.loadedFromFallback = false;
    this.totalMembers = 0;
    this.totalLocations = 0;
    this.geocodedLocations = 0;
    this.citySummaries = [];

    this.map = L.map('map', { scrollWheelZoom: false }).setView([37.0902, -95.7129], 4);
    this.invalidateMapSize();

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.memberLayer = L.layerGroup().addTo(this.map);
    this.communityLayer = L.layerGroup().addTo(this.map);

    const bounds = L.latLngBounds([]);

    try {
      this.cityCache = await fetch('/api/city-coords').then(res => res.json());
    } catch {
      this.cityCache = {};
    }

    let data: CatalogEntry[] = [];
    try {
      data = await fetch('/api/data').then(res => res.json());
    } catch {
      data = fallbackData;
      this.loadedFromFallback = true;
    }

    const cityMap: Record<string, CityData> = {};
    for (const entry of data) {
      const key = `${entry.city?.trim()}, ${entry.state?.trim()}, ${entry.country?.trim()}`;
      if (!cityMap[key]) cityMap[key] = { coords: null as unknown as Coords, names: [] };
      cityMap[key].names.push(entry.name ?? 'Anonymous');
    }

    const rawSummaries = Object.entries(cityMap)
      .map(([key, city]) => ({ key, count: city.names.length }))
      .filter(item => item.key.replaceAll(',', '').trim().length > 0);

    this.totalMembers = rawSummaries.reduce((sum, item) => sum + item.count, 0);
    this.totalLocations = rawSummaries.length;
    this.citySummaries = rawSummaries.slice().sort((a, b) => b.count - a.count).slice(0, 24);

    for (const [key, city] of Object.entries(cityMap)) {
      let coords: Coords | null = this.cityCache[key] ?? null;
      if (!coords) coords = await this.fetchCoordsThrottled(key);
      if (!coords) continue;

      city.coords = coords;
      this.geocodedLocations += 1;

      const icon = city.names.length > 1
        ? L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="pin-count">${city.names.length}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32],
          })
        : mapPinIcon;

      const popupContent = `<strong>${key}</strong><br/>Members: ${city.names.length}<br/><small>Names hidden by default for privacy.</small>`;
      L.marker([coords.lat, coords.lon], { icon })
        .bindPopup(popupContent)
        .addTo(this.memberLayer!);
      bounds.extend([coords.lat, coords.lon]);
    }

    await this.refreshCommunityPins(bounds);

    if (this.map && bounds.isValid()) {
      this.map.fitBounds(bounds.pad(0.2), { animate: false });
    }

    this.isLoading = false;
    this.invalidateMapSize();
  }

  private invalidateMapSize(): void {
    window.setTimeout(() => this.map?.invalidateSize({ animate: false }), 0);
    window.setTimeout(() => this.map?.invalidateSize({ animate: false }), 200);
  }

  private async refreshCommunityPins(bounds?: L.LatLngBounds): Promise<void> {
    try {
      const pins = await new Promise<CommunityPin[]>((resolve, reject) => {
        this.pinService.list().subscribe({ next: resolve, error: reject });
      });
      this.communityPins = pins;
      this.communityPinCount = pins.length;
      this.communityLayer?.clearLayers();
      for (const pin of pins) {
        if (!Number.isFinite(pin.lat) || !Number.isFinite(pin.lon)) continue;
        const place = [pin.city, pin.state, pin.country].filter(Boolean).join(', ') || 'Location withheld';
        const role = pin.role ? `<div class="muted small">${escapeHtml(pin.role)}</div>` : '';
        const notes = pin.notes ? `<p class="muted small" style="margin:0.4rem 0 0;">${escapeHtml(pin.notes)}</p>` : '';
        const youBadge = pin.isOwner ? ' <span class="pill">You</span>' : '';
        const html = `
          <div class="community-pin-popup">
            <strong>${escapeHtml(pin.displayName)}</strong>${youBadge}
            ${role}
            <div class="small">${escapeHtml(place)}</div>
            ${notes}
          </div>`;
        L.marker([pin.lat, pin.lon], {
          icon: L.divIcon({
            className: 'community-pin-icon' + (pin.isOwner ? ' is-owner' : ''),
            html: '<span></span>',
            iconSize: [22, 22],
            iconAnchor: [11, 22],
            popupAnchor: [0, -22],
          })
        })
          .bindPopup(html)
          .addTo(this.communityLayer!);
        bounds?.extend([pin.lat, pin.lon]);
      }
    } catch (err) {
      console.warn('Could not load community pins', err);
    }
  }

  private lastFetchTime = 0;
  private async fetchCoordsThrottled(key: string): Promise<Coords | null> {
    const now = Date.now();
    const elapsed = now - this.lastFetchTime;
    if (elapsed < 1000) await new Promise(r => setTimeout(r, 1000 - elapsed));
    const coords = await this.fetchCoords(key);
    this.lastFetchTime = Date.now();
    return coords;
  }

  private async fetchCoords(key: string): Promise<Coords | null> {
    try {
      const results = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(key)}&format=json&limit=1`
      ).then(res => res.json());
      if (!results.length) return null;
      const coords: Coords = { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) };
      this.cityCache[key] = coords;
      fetch('/api/save-coords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, coords }),
      }).catch(() => undefined);
      return coords;
    } catch {
      return null;
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
