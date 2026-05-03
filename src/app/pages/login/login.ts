import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, switchMap } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { PinService } from '../../services/pin.service';

type Mode = 'login' | 'signup';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class Login {
  email = '';
  password = '';
  name = '';
  role = '';
  city = '';
  state = '';
  country = 'United States';
  notes = '';
  mode = signal<Mode>('login');
  isSubmitting = signal(false);
  errorMessage = signal('');

  constructor(
    private readonly auth: AuthService,
    private readonly pins: PinService,
    private readonly router: Router,
    private readonly route: ActivatedRoute
  ) {
    const initial = this.route.snapshot.queryParamMap.get('mode');
    if (initial === 'signup' || initial === 'login') {
      this.mode.set(initial);
    }
  }

  setMode(next: Mode) {
    this.mode.set(next);
    this.errorMessage.set('');
  }

  onSubmit() {
    if (this.isSubmitting()) return;
    this.errorMessage.set('');
    const mode = this.mode();
    const email = this.email.trim();
    const password = this.password;
    const name = this.name.trim();

    if (!email || !password) {
      this.errorMessage.set('Email and password are required.');
      return;
    }
    if (mode === 'signup') {
      if (!name) { this.errorMessage.set('Please enter your name.'); return; }
      if (password.length < 8) { this.errorMessage.set('Password must be at least 8 characters.'); return; }
      if (!this.city.trim()) { this.errorMessage.set('City is required so we can place your pin on the map.'); return; }
      if (!this.country.trim()) { this.errorMessage.set('Country is required so we can place your pin on the map.'); return; }
    }

    this.isSubmitting.set(true);
    const obs: Observable<unknown> = mode === 'signup'
      ? this.auth.signup(email, name, password).pipe(
          switchMap(() => this.pins.upsert({
            name,
            role: this.role.trim() || 'Community member',
            city: this.city.trim(),
            state: this.state.trim() || undefined,
            country: this.country.trim(),
            notes: this.notes.trim() || undefined,
            isPublic: true,
          }))
        )
      : this.auth.login(email, password);

    obs.subscribe({
      next: () => {
        this.isSubmitting.set(false);
        const redirect = mode === 'signup'
          ? '/map'
          : this.route.snapshot.queryParamMap.get('redirect') || '/account';
        this.router.navigateByUrl(redirect);
      },
      error: (err: Error) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err.message || 'Could not complete the request.');
      }
    });
  }
}
