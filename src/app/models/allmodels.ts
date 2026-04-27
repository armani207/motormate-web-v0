export interface CatalogEntry {
  name: string | null;
  role: string;
  city: string;
  state: string;
  country: string;
  experiences?: string | null;
}

export interface Coords {
  lat: number;
  lon: number;
}

export interface CityData {
  coords: Coords;
  names: string[];
}


export interface WorldPopData {
  population: string;
  birthsToday: string;
  timestamp: number;
  cached?: boolean;
  error?: string;
}
