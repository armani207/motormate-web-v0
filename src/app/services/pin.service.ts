import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';

export interface CommunityPin {
  id: string;
  userId: string;
  displayName: string;
  role: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  notes: string | null;
  lat: number;
  lon: number;
  isOwner: boolean;
  isPublic: boolean;
  /** Owner-only: the raw name on the pin (for editing). */
  name?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PinUpsertPayload {
  name?: string;
  role?: string;
  city: string;
  state?: string;
  country?: string;
  notes?: string;
  isPublic?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PinService {
  constructor(private readonly http: HttpClient) {}

  list(): Observable<CommunityPin[]> {
    return this.http.get<CommunityPin[]>('/api/pins').pipe(
      catchError((err) => throwError(() => this.toError(err)))
    );
  }

  mine(): Observable<CommunityPin | null> {
    return this.http.get<{ pin: CommunityPin | null }>('/api/pins/mine').pipe(
      map((res) => res.pin),
      catchError((err) => throwError(() => this.toError(err)))
    );
  }

  upsert(payload: PinUpsertPayload): Observable<CommunityPin> {
    return this.http.post<{ pin: CommunityPin }>('/api/pins', payload).pipe(
      map((res) => res.pin),
      catchError((err) => throwError(() => this.toError(err)))
    );
  }

  removeMine(): Observable<void> {
    return this.http.delete<{ ok: true }>('/api/pins/mine').pipe(
      map(() => undefined),
      catchError((err) => throwError(() => this.toError(err)))
    );
  }

  private toError(err: unknown): Error {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { error?: string } | null;
      return new Error(body?.error || err.message || 'Pin request failed.');
    }
    if (err instanceof Error) return err;
    return new Error('Pin request failed.');
  }
}
