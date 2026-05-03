import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import * as L from 'leaflet';

interface PrevalenceProperties {
  name: string;
  prevalencePer1000: number;
  childrenEstimate: string;
  note: string;
  source: string;
}

@Component({
  selector: 'app-cp-impact-map',
  standalone: true,
  templateUrl: './cp-impact-map.html',
  styleUrl: './cp-impact-map.css',
})
export class CpImpactMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLElement>;
  private map?: L.Map;

  async ngAfterViewInit(): Promise<void> {
    this.map = L.map(this.mapContainer.nativeElement, {
      attributionControl: true,
      scrollWheelZoom: false,
      worldCopyJump: true,
    }).setView([24, 8], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(this.map);

    const response = await fetch('/data/cp-prevalence-regions.geojson');
    const geojson = await response.json();

    const layer = L.geoJSON(geojson, {
      style: feature => this.getStyle(feature?.properties as PrevalenceProperties),
      onEachFeature: (feature, layerItem) => {
        const props = feature.properties as PrevalenceProperties;
        layerItem.bindTooltip(
          `<strong>${props.name}</strong><br>${props.prevalencePer1000} per 1,000 live births<br>${props.childrenEstimate}<br><small>${props.note}</small>`,
          { sticky: true }
        );
        layerItem.on({
          mouseover: event => {
            (event.target as L.Path).setStyle({ weight: 3, fillOpacity: 0.82 });
          },
          mouseout: event => {
            layer.resetStyle(event.target);
          },
        });
      },
    }).addTo(this.map);

    this.map.fitBounds(layer.getBounds(), { padding: [18, 18] });
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private getStyle(props: PrevalenceProperties): L.PathOptions {
    const intensity = Math.min(Math.max((props.prevalencePer1000 - 1.5) / 2.2, 0), 1);
    return {
      color: '#0f5c7a',
      fillColor: this.interpolateColor(intensity),
      fillOpacity: 0.62,
      opacity: 0.82,
      weight: 1.4,
    };
  }

  private interpolateColor(intensity: number): string {
    if (intensity > 0.72) return '#c9574a';
    if (intensity > 0.48) return '#e87461';
    if (intensity > 0.24) return '#f2aa7e';
    return '#8fc7d4';
  }
}
