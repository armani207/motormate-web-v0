import { Injectable, computed, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: number;
}

interface AuthResponse {
  user: AuthUser | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userSignal = signal<AuthUser | null>(null);
  private readonly readySignal = signal<boolean>(false);

  readonly user = computed(() => this.userSignal());
  readonly isAuthenticated = computed(() => this.userSignal() !== null);
  readonly isReady = computed(() => this.readySignal());

  constructor(private readonly http: HttpClient) {
    this.refresh().subscribe();
  }

  refresh(): Observable<AuthUser | null> {
    return this.http.get<AuthResponse>('/api/auth/me').pipe(
      map((res) => res.user ?? null),
      tap((user) => {
        this.userSignal.set(user);
        this.readySignal.set(true);
      }),
      catchError(() => {
        this.userSignal.set(null);
        this.readySignal.set(true);
        return of(null);
      })
    );
  }

  signup(email: string, name: string, password: string): Observable<AuthUser> {
    return this.http
      .post<AuthResponse>('/api/auth/signup', { email, name, password })
      .pipe(
        map((res) => {
          if (!res.user) throw new Error('Sign up failed.');
          return res.user;
        }),
        tap((user) => this.userSignal.set(user)),
        catchError((err) => throwError(() => this.toError(err)))
      );
  }

  login(email: string, password: string): Observable<AuthUser> {
    return this.http
      .post<AuthResponse>('/api/auth/login', { email, password })
      .pipe(
        map((res) => {
          if (!res.user) throw new Error('Sign in failed.');
          return res.user;
        }),
        tap((user) => this.userSignal.set(user)),
        catchError((err) => throwError(() => this.toError(err)))
      );
  }

  logout(): Observable<void> {
    return this.http.post<{ ok: true }>('/api/auth/logout', {}).pipe(
      tap(() => this.userSignal.set(null)),
      map(() => undefined)
    );
  }

  private toError(err: unknown): Error {
    if (err instanceof HttpErrorResponse) {
      const message = (err.error && (err.error as { error?: string }).error) || err.message;
      return new Error(message);
    }
    if (err instanceof Error) return err;
    return new Error('Something went wrong.');
  }
}
