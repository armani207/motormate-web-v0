import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CpCatalog } from './cp-catalog';

describe('CpCatalog', () => {
  let component: CpCatalog;
  let fixture: ComponentFixture<CpCatalog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CpCatalog]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CpCatalog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
