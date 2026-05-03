import { CommonModule, NgOptimizedImage } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-motormate',
  imports: [CommonModule, RouterLink, NgOptimizedImage],
  templateUrl: './motormate.html'
})
export class Motormate {
  /** Served from site root (`public/` → dist). Add matching `.webp` files later for `<picture>` if desired. */
  imagePath = '/motor-mate-proto.jpg';
  imagePathClinic = '/motor-mate-clinic-setting.jpg';
  imagePathRoadmap = '/roadmap-motormate.jpg';
  imagePathProjections = '/projections-motormate.jpg';
}
