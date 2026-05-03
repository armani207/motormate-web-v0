import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable, of, tap } from 'rxjs';
import { CatalogEntry } from '../models/allmodels';
import { fallbackData } from '../utils/constants';

export type CatalogLoadSource = 'network' | 'cache' | 'fallback';

export interface CatalogLoadResult {
  data: CatalogEntry[];
  source: CatalogLoadSource;
}

@Injectable({
  providedIn: 'root'
})
export class CatalogService {
  private cache: CatalogEntry[] = [];

  constructor(private http: HttpClient) {}

  /**
   * Fetch data from backend (Google Sheets via /api/data)
   * and cache results for later use.
   */
  loadCatalog(): Observable<CatalogLoadResult> {
    if (this.cache.length > 0) {
      return of({ data: this.cache, source: 'cache' as const });
    }

    return this.http.get<CatalogEntry[]>('/api/data').pipe(
      tap(data => (this.cache = data || [])),
      map(data => ({ data: data || [], source: 'network' as const })),
      catchError(() => {
        this.cache = fallbackData;
        return of({ data: fallbackData, source: 'fallback' as const });
      })
    );
  }

  /**
   * Filter by role, name, city, state, country, or experiences.
   * Case-insensitive match. If query empty, return empty (to show no results until search).
   */
  filterCatalog(data: CatalogEntry[], query: string): CatalogEntry[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    return data.filter(entry =>
      [entry.name, entry.role, entry.city, entry.state, entry.country, entry.experiences].some(
        field => typeof field === 'string' && field.toLowerCase().includes(q)
      )
    );
  }

  /** Optional: clear cache manually (for refresh button, etc.) */
  clearCache() {
    this.cache = [];
  }
}
