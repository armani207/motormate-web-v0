import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { CpCatalog } from './cp-catalog';
import { CatalogService, CatalogLoadResult } from '../../services/catalog.service';
import { PinService, CommunityPin } from '../../services/pin.service';
import { AuthService } from '../../services/auth.service';

describe('CpCatalog', () => {
  let component: CpCatalog;
  let fixture: ComponentFixture<CpCatalog>;
  let catalogService: jasmine.SpyObj<CatalogService>;
  let pinService: jasmine.SpyObj<PinService>;
  let authService: jasmine.SpyObj<AuthService>;

  const catalogEntry = {
    name: 'Alex R',
    role: 'Family',
    city: 'Detroit',
    state: 'MI',
    country: 'USA',
    experiences: 'Looking for therapy support.'
  };

  beforeEach(async () => {
    catalogService = jasmine.createSpyObj<CatalogService>('CatalogService', ['loadCatalog']);
    catalogService.loadCatalog.and.returnValue(of({ data: [], source: 'network' }));

    pinService = jasmine.createSpyObj<PinService>('PinService', ['list', 'mine', 'upsert', 'removeMine']);
    pinService.list.and.returnValue(of<CommunityPin[]>([]));

    authService = jasmine.createSpyObj<AuthService>('AuthService', ['logout', 'login', 'signup', 'refresh'], {
      isAuthenticated: () => false,
      isReady: () => true,
      user: () => null,
    } as Partial<AuthService>);

    await TestBed.configureTestingModule({
      imports: [CpCatalog],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: CatalogService, useValue: catalogService },
        { provide: PinService, useValue: pinService },
        { provide: AuthService, useValue: authService }
      ]
    }).compileComponents();
  });

  function createComponent() {
    fixture = TestBed.createComponent(CpCatalog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }


  it('should create', () => {
    createComponent();
    expect(component).toBeTruthy();
  });

  it('shows a loading state while the catalog request is pending', () => {
    const pendingCatalog = new Subject<CatalogLoadResult>();
    catalogService.loadCatalog.and.returnValue(pendingCatalog.asObservable());

    createComponent();

    expect(component.isLoading).toBeTrue();
    expect(component.errorMessage).toBe('');
    expect(component.allEntries).toEqual([]);
  });

  it('stores catalog entries after a successful load', () => {
    catalogService.loadCatalog.and.returnValue(of({ data: [catalogEntry], source: 'network' }));

    createComponent();

    expect(component.isLoading).toBeFalse();
    expect(component.allEntries).toEqual([catalogEntry]);
    expect(component.errorMessage).toBe('');
    expect(component.showFallbackBanner).toBeFalse();
  });

  it('shows an error state when the catalog request fails', () => {
    catalogService.loadCatalog.and.returnValue(throwError(() => new Error('network failed')));

    createComponent();

    expect(component.isLoading).toBeFalse();
    expect(component.allEntries).toEqual([]);
    expect(component.errorMessage).toBe('We could not load the catalog right now. Please try again in a moment.');
    expect(component.showFallbackBanner).toBeFalse();
  });
});
