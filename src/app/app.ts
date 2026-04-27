import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Header } from './header/header';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, Header],
  template: `
    <app-header></app-header>
    <router-outlet></router-outlet>
  `
})
export class App {}
