import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-join',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './join.html'
})
export class Join {

}
