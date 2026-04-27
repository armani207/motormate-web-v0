import L from 'leaflet';

import dataJson from '../../assets/data.json';
export const fallbackData: { name: string | null; city: string; state: string; country: string, role: string, experiences?: string | null }[] = dataJson;


// The frontend doesn't read/write files anymore
// cityCoords will be fetched from the backend API
export let cityCoords: { [key: string]: { lat: number; lon: number } } = {};

// Initialize map pin icon
export const mapPinIcon = L.icon({
  iconUrl: 'pin.svg',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

// Optional helper to update in-memory coords (frontend cache only)
export const updateCityCoords = (key: string, coords: { lat: number; lon: number }) => {
  cityCoords[key] = coords;
};
