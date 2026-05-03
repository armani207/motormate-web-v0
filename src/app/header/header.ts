import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.html'
})
export class Header {
  isMobileNavOpen = false;
  isScrolled = false;

  constructor(
    private readonly router: Router,
    public readonly auth: AuthService
  ) {}

  @HostListener('window:scroll')
  onWindowScroll() {
    this.isScrolled = window.scrollY > 12;
  }

  toggleMobileNav() {
    this.setMobileNav(!this.isMobileNavOpen);
  }

  closeMobileNav() {
    this.setMobileNav(false);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.isMobileNavOpen) this.setMobileNav(false);
  }

  signOut() {
    this.auth.logout().subscribe(() => {
      this.closeMobileNav();
      this.router.navigateByUrl('/');
    });
  }

  private setMobileNav(open: boolean) {
    this.isMobileNavOpen = open;
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('nav-open', open);
    }
  }
}
