import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CommunityPin, PinService } from '../../services/pin.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './account.html',
  styleUrls: ['./account.css']
})
export class Account implements OnInit {
  readonly auth: AuthService;
  pin = signal<CommunityPin | null>(null);
  isLoading = signal(true);
  isSaving = signal(false);
  isRemoving = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  form = {
    name: '',
    role: '',
    city: '',
    state: '',
    country: '',
    notes: '',
    isPublic: true,
  };

  constructor(
    auth: AuthService,
    private readonly pins: PinService,
    private readonly router: Router
  ) {
    this.auth = auth;
  }

  ngOnInit(): void {
    if (!this.auth.isReady()) {
      this.auth.refresh().subscribe(() => this.loadPin());
    } else {
      this.loadPin();
    }
  }

  private loadPin() {
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/login'], { queryParams: { redirect: '/account' } });
      return;
    }
    this.isLoading.set(true);
    this.pins.mine().subscribe({
      next: (pin) => {
        this.pin.set(pin);
        if (pin) {
          this.form = {
            name: pin.name || pin.displayName || this.auth.user()?.name || '',
            role: pin.role || '',
            city: pin.city || '',
            state: pin.state || '',
            country: pin.country || '',
            notes: pin.notes || '',
            isPublic: pin.isPublic,
          };
        } else {
          this.form.name = this.auth.user()?.name || '';
        }
        this.isLoading.set(false);
      },
      error: (err: Error) => {
        this.errorMessage.set(err.message);
        this.isLoading.set(false);
      }
    });
  }

  savePin() {
    if (this.isSaving()) return;
    this.errorMessage.set('');
    this.successMessage.set('');
    if (!this.form.city.trim()) {
      this.errorMessage.set('City is required so we can place your pin.');
      return;
    }
    this.isSaving.set(true);
    this.pins.upsert({
      name: this.form.name.trim() || undefined,
      role: this.form.role.trim() || undefined,
      city: this.form.city.trim(),
      state: this.form.state.trim() || undefined,
      country: this.form.country.trim() || undefined,
      notes: this.form.notes.trim() || undefined,
      isPublic: this.form.isPublic,
    }).subscribe({
      next: (pin) => {
        this.pin.set(pin);
        this.isSaving.set(false);
        this.successMessage.set('Your pin is on the map.');
      },
      error: (err: Error) => {
        this.isSaving.set(false);
        this.errorMessage.set(err.message);
      }
    });
  }

  removePin() {
    if (this.isRemoving()) return;
    if (!confirm('Remove your pin from the community map?')) return;
    this.isRemoving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.pins.removeMine().subscribe({
      next: () => {
        this.pin.set(null);
        this.isRemoving.set(false);
        this.successMessage.set('Your pin has been removed.');
      },
      error: (err: Error) => {
        this.isRemoving.set(false);
        this.errorMessage.set(err.message);
      }
    });
  }

  signOut() {
    this.auth.logout().subscribe(() => this.router.navigateByUrl('/'));
  }
}
