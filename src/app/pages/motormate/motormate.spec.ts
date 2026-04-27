import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Motormate } from './motormate';

describe('Motormate', () => {
  let component: Motormate;
  let fixture: ComponentFixture<Motormate>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Motormate]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Motormate);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
