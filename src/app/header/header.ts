import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.html'
})
export class Header {
  isMobileNavOpen = false;
  isMainNavVisible = true;
  constructor(private router: Router) {}

  toggleMobileNav() {
    this.isMobileNavOpen = !this.isMobileNavOpen;
  }

  toggleMainNavDisplay() {
    this.isMainNavVisible = !this.isMainNavVisible;
  }

  closeMobileNav() {
    this.isMobileNavOpen = false;
  }
}
