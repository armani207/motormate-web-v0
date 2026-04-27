import { Routes } from '@angular/router';
import { About } from './pages/about/about';
import { CpCatalog } from './pages/cp-catalog/cp-catalog';
import { GetInvolved } from './pages/get-involved/get-involved';
import { Home } from './pages/home/home';
import { Join } from './pages/join/join';
import { Motormate } from './pages/motormate/motormate';
import { NotFound } from './pages/not-found/not-found';
import { Privacy } from './pages/privacy/privacy';

export const routes: Routes = [
  { path: 'about', component: About },
  { path: 'cp-catalog', component: CpCatalog },
  { path: '', component: Home },
  { path: 'partner', component: GetInvolved },
  { path: 'join', component: Join },
  { path: 'privacy', component: Privacy },
  { path: 'motormate', component: Motormate },
  { path: '**', component: NotFound }
];
