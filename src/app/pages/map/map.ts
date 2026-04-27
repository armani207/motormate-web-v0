// src/app/pages/map/map.ts
import { AfterViewInit, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import {fallbackData, mapPinIcon} from '../../utils/constants';
import { CatalogEntry, Coords, CityData } from '../../models/allmodels';


@Component({
  selector: 'app-map',
  imports: [CommonModule],
  standalone: true,
  templateUrl: './map.html',
  styleUrls: ['./map.css']
})
export class Map implements AfterViewInit {
  private map: L.Map | undefined;
  private cityCache: Record<string, Coords> = {};
  public cityNamesList: { key: string; names: string[] }[] = [];

  ngAfterViewInit(): void {
    this.initMap();
  }

  private async initMap(): Promise<void> {
    this.map = L.map('map').setView([37.0902, -95.7129], 4);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    const bounds = L.latLngBounds([]);
    const customIcon = mapPinIcon;

    // Load cached coords from server
    this.cityCache = await fetch('/api/city-coords').then(res => res.json());

    // Fetch Google Sheets data
    let data: CatalogEntry[] = []

    try {
      data = await fetch('/api/data').then(res => res.json());
    } catch (err) {
      // If API fails, fallback to local data
      data = fallbackData;
    }

    // Group entries by city,state,country key
    const cityMap: Record<string, CityData> = {};

    for (const entry of data) {
      const key = `${entry.city?.trim()}, ${entry.state?.trim()}, ${entry.country?.trim()}`;
      if (!cityMap[key]) cityMap[key] = { coords: null as any, names: [] };

      if (entry.name != null ) {
        cityMap[key].names.push(entry.name);
      }
      else {
        cityMap[key].names.push("Anonymous");
      }
    }

    // Iterate through cities and place markers
    for (const [key, city] of Object.entries(cityMap)) {
      // Get coords from cache or Nominatim
      let coords: Coords | null = this.cityCache[key] ?? null;

      if (!coords) {
        coords = await this.fetchCoordsThrottled(key);
        if (!coords) continue; // skip city if still null
      }

      // Now coords is guaranteed
      city.coords = coords;

      // Marker label = count of names
      if (this.map) {
        // If multiple members, use a DivIcon to show count on the pin
        const icon =
          city.names.length > 1
            ? L.divIcon({
              className: 'custom-div-icon',
              html: `<div class="pin-count">${city.names.length}</div>`,
              iconSize: [32, 32],
              iconAnchor: [16, 32],
              popupAnchor: [0, -32],
            })
            : customIcon;

        // Build popup content
        let popupContent = `<strong>${key}</strong><br/>Members: ${city.names.length}`;
        if (city.names.length > 1) {
          popupContent += '<br/><ul>';
          for (const name of city.names) {
            popupContent += `<li>${name}</li>`;
          }
          popupContent += '</ul>';
        }

        L.marker([coords.lat, coords.lon], { icon: customIcon })
          .addTo(this.map)
          .bindPopup(popupContent);

        bounds.extend([coords.lat, coords.lon]);
      }
      }
    }

  // Throttle Nominatim to 1s per request
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
    // Call Nominatim
    const results = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(key)}&format=json`
    ).then(res => res.json());

    if (!results.length) return null;

    const coords: Coords = { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) };
    this.cityCache[key] = coords;

    // Save to server cache
    fetch('/api/save-coords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, coords })
    });

    return coords;
  }
}
