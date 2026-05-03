import { Component, isDevMode } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CatalogService } from '../../services/catalog.service';
import { CatalogEntry } from '../../models/allmodels';
import { AuthService } from '../../services/auth.service';
import { CommunityPin, PinService } from '../../services/pin.service';

@Component({
  selector: 'app-cp-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './cp-catalog.html'
})
export class CpCatalog {
  allEntries: CatalogEntry[] = [];
  filtered: CatalogEntry[] = [];
  visibleEntries: CatalogEntry[] = [];

  communityPins: CommunityPin[] = [];
  filteredPins: CommunityPin[] = [];
  visiblePins: CommunityPin[] = [];

  query = '';
  pageSize = 9;
  page = 1;
  isLoading = true;
  isSearching = false;
  errorMessage = '';
  loadedFromFallback = false;
  showFallbackBanner = false;

  constructor(
    private catalogService: CatalogService,
    private pinService: PinService,
    public auth: AuthService
  ) {
    this.loadData();
  }

  loadData() {
    this.isLoading = true;
    this.errorMessage = '';

    this.catalogService.loadCatalog().subscribe({
      next: (result) => {
        this.allEntries = result.data;
        this.loadedFromFallback = result.source === 'fallback';
        this.showFallbackBanner = this.loadedFromFallback && isDevMode();
        this.applyFilters();
      },
      error: () => {
        this.loadedFromFallback = false;
        this.showFallbackBanner = false;
        this.errorMessage = 'We could not load the catalog right now. Please try again in a moment.';
      }
    }).add(() => {
      this.isLoading = false;
    });

    this.pinService.list().subscribe({
      next: (pins) => {
        this.communityPins = pins;
        this.applyFilters();
      },
      error: () => {
        this.communityPins = [];
      }
    });
  }

  onSearch() {
    this.isSearching = true;
    this.page = 1;
    this.applyFilters();
    queueMicrotask(() => (this.isSearching = false));
  }

  clearSearch() {
    this.query = '';
    this.page = 1;
    this.applyFilters();
  }

  loadMore() {
    this.page++;
    this.updateVisibleEntries();
  }

  get hasResults(): boolean {
    return this.filtered.length > 0 || this.filteredPins.length > 0;
  }

  private applyFilters() {
    const q = this.query.trim().toLowerCase();
    if (!q) {
      this.filtered = this.allEntries.slice();
      this.filteredPins = this.communityPins.slice();
    } else {
      this.filtered = this.allEntries.filter((entry) =>
        ['name', 'role', 'city', 'state', 'country', 'experiences'].some((key) => {
          const value = entry[key as keyof CatalogEntry];
          return typeof value === 'string' && value.toLowerCase().includes(q);
        })
      );
      this.filteredPins = this.communityPins.filter((pin) =>
        [pin.displayName, pin.role, pin.city, pin.state, pin.country, pin.notes].some(
          (field) => typeof field === 'string' && field.toLowerCase().includes(q)
        )
      );
    }
    this.updateVisibleEntries();
  }

  private updateVisibleEntries() {
    this.visibleEntries = this.filtered.slice(0, this.page * this.pageSize);
    this.visiblePins = this.filteredPins.slice(0, this.page * this.pageSize);
  }

  protected readonly Boolean = Boolean;
}
