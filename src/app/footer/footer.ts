import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterModule],
  template: `
    <footer class="footer-note">
      <div class="container">
        <small>&copy; 2026 MotorMate Health LLC · <a routerLink="/privacy">Privacy policy</a></small>
      </div>
    </footer>
  `
})
export class Footer {}

