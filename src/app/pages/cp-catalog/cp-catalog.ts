import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CatalogService } from '../../services/catalog.service';
import {  HttpClientModule} from '@angular/common/http';

@Component({
  selector: 'app-cp-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './cp-catalog.html',
  providers: [CatalogService]
})
export class CpCatalog {
  allEntries: any[] = [];
  filtered: any[] = [];
  visibleEntries: any[] = [];
  query = '';
  pageSize = 5;
  page = 1;

  constructor(private catalogService: CatalogService) {
    this.loadData();
  }

  loadData() {
    this.catalogService.loadCatalog().subscribe(data => {
      this.allEntries = data;
      this.filtered = [];
      this.visibleEntries = [];
    });
  }

  onSearch() {
    const q = this.query.trim().toLowerCase();
    if (!q) {
      this.filtered = [];
      this.visibleEntries = [];
      this.page = 1;
      return;
    }

    this.filtered = this.allEntries.filter(entry =>
      ['name', 'role', 'city', 'state', 'country', 'experiences'].some(
        key => entry[key]?.toLowerCase().includes(q)
      )
    );

    this.page = 1;
    this.updateVisibleEntries();
  }

  updateVisibleEntries() {
    this.visibleEntries = this.filtered.slice(0, this.page * this.pageSize);
  }

  loadMore() {
    this.page++;
    this.updateVisibleEntries();
  }

  protected readonly Boolean = Boolean;
}
