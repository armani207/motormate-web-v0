import { Component } from '@angular/core';
import { Map } from '../map/map';
import { CalcCardComponent } from '../../calc-card/calc-card';
import {CommonModule} from '@angular/common';

@Component({
  selector: 'app-home',
  imports: [Map, CalcCardComponent, CommonModule],
  templateUrl: './home.html'
})
export class Home {}
