import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GetInvolved } from './get-involved';

describe('GetInvolved', () => {
  let component: GetInvolved;
  let fixture: ComponentFixture<GetInvolved>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GetInvolved]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GetInvolved);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
