import { Routes } from '@angular/router';
import { About } from './pages/about/about';
import { Account } from './pages/account/account';
import { CpCatalog } from './pages/cp-catalog/cp-catalog';
import { GetInvolved } from './pages/get-involved/get-involved';
import { Home } from './pages/home/home';
import { Join } from './pages/join/join';
import { Login } from './pages/login/login';
import { Map } from './pages/map/map';
import { Motormate } from './pages/motormate/motormate';
import { NotFound } from './pages/not-found/not-found';
import { Privacy } from './pages/privacy/privacy';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'about', component: About },
  { path: 'account', component: Account },
  { path: 'cp-catalog', component: CpCatalog },
  { path: 'join', component: Join },
  { path: 'login', component: Login },
  { path: 'map', component: Map },
  { path: 'motormate', component: Motormate },
  { path: 'partner', component: GetInvolved },
  { path: 'privacy', component: Privacy },
  { path: '**', component: NotFound }
];
