import {
  AfterViewInit,
  Component,
  ElementRef,
  HostBinding,
  Input,
  NgZone,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Camera, Mesh, Plane, Program, Renderer, Transform } from 'ogl';

/** Fragment loop bound — keep TS cap and GLSL MAX_LINES in sync. */
const MAX_LINES_SHADER = 24;

/** Fullscreen quad — OGL supplies `modelViewMatrix` and `projectionMatrix`. */
const FLOATING_LINES_VERTEX = /* glsl */ `#version 300 es
in vec3 position;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Single stacked wave field, interactive bend + parallax.
 * WebGL2 — matches OGL Renderer default.
 */
const FLOATING_LINES_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform float iTime;
uniform vec3 iResolution;
uniform float animationSpeed;

uniform vec2 iMouse;
uniform int interactive;
uniform float bendRadius;
uniform float bendStrength;
uniform float bendInfluence;

uniform int parallax;
uniform vec2 parallaxOffset;

uniform vec3 lineGradient[8];
uniform int lineGradientCount;

uniform int uLineCount;

out vec4 fragColor;

const int MAX_LINES = 24;

mat2 rotate(float r) {
  return mat2(cos(r), sin(r), -sin(r), cos(r));
}

vec3 getLineColor(float t) {
  if (lineGradientCount <= 0) {
    vec3 teal = vec3(15.0, 92.0, 122.0) / 255.0;
    vec3 coral = vec3(232.0, 116.0, 97.0) / 255.0;
    return mix(teal, coral, t);
  }
  if (lineGradientCount == 1) return lineGradient[0];
  float clampedT = clamp(t, 0.0, 0.9999);
  float scaled = clampedT * float(lineGradientCount - 1);
  int idx = int(floor(scaled));
  float f = fract(scaled);
  int idx2 = min(idx + 1, lineGradientCount - 1);
  return mix(lineGradient[idx], lineGradient[idx2], f);
}

float wave(vec2 uv, float offset, vec2 screenUv, vec2 mouseUv, int shouldBend, float ampMul) {
  float time = iTime * animationSpeed;
  float xMove = time * 0.1;
  float amp = sin(offset + time * 0.2) * 0.28 * ampMul;
  float y = sin(uv.x + offset + xMove) * amp;

  if (shouldBend != 0) {
    vec2 d = screenUv - mouseUv;
    float influence = exp(-dot(d, d) * bendRadius);
    float bendOffset = (mouseUv.y - screenUv.y) * influence * bendStrength * bendInfluence;
    y += bendOffset;
  }

  float m = uv.y - y;
  return 0.018 / max(abs(m) + 0.01, 1e-3);
}

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 baseUv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
  baseUv.y *= -1.0;

  vec2 screenUv = baseUv;
  if (parallax != 0) {
    baseUv += parallaxOffset;
  }

  vec2 mouseUv = vec2(0.0);
  if (interactive != 0) {
    mouseUv = (2.0 * iMouse - iResolution.xy) / iResolution.y;
    mouseUv.y *= -1.0;
  }

  vec3 col = vec3(0.02, 0.05, 0.08);
  int count = min(MAX_LINES, max(1, uLineCount));

  for (int i = 0; i < MAX_LINES; i++) {
    if (i >= count) break;
    float fi = float(i);
    float t = fi / max(float(count - 1), 1.0);
    vec3 lineCol = getLineColor(t) * 0.55;

    float layer = mod(fi, 3.0);
    float spacing = mix(5.5, 3.5, layer / 2.0) * 0.01;
    float rot = mix(-0.35, 0.45, layer / 2.0) * log(length(baseUv) + 1.0);
    vec2 ruv = baseUv * rotate(rot);
    float off = 1.3 + 0.18 * fi + layer * 0.7;
    float ampMul = layer < 0.5 ? 0.85 : (layer < 1.5 ? 1.0 : 1.15);
    float br = layer < 1.5 ? 1.0 : 0.85;

    col += lineCol * wave(
      ruv + vec2(spacing * fi + layer * 0.15, layer * -0.25),
      off,
      screenUv,
      mouseUv,
      interactive,
      ampMul
    ) * 0.22 * br;
  }

  fragColor = vec4(col, 1.0);
}
`;

@Component({
  selector: 'app-floating-lines',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './floating-lines.html',
  styleUrl: './floating-lines.css',
})
export class FloatingLinesComponent implements AfterViewInit, OnDestroy {
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLElement>;

  /** Hex colors for line gradient (max 8). */
  @Input() linesGradient?: string[];
  @Input() enabledWaves: ('top' | 'middle' | 'bottom')[] = ['top', 'middle', 'bottom'];
  /** Per-wave counts or one count for all enabled waves. */
  @Input() lineCount: number | number[] = [10, 15, 20];
  @Input() animationSpeed = 1;
  @Input() interactive = true;
  @Input() bendRadius = 5.0;
  @Input() bendStrength = -0.5;
  @Input() mouseDamping = 0.05;
  @Input() parallax = true;
  @Input() parallaxStrength = 0.2;
  @Input() mixBlendMode = 'screen';

  @HostBinding('class.floating-lines-host')
  readonly hostClass = true;

  @HostBinding('class.floating-lines-host--reduced')
  reducedMotion = false;

  private readonly teardownFns: Array<() => void> = [];

  private destroyed = false;
  private rafId = 0;
  private resizeObserver?: ResizeObserver;
  private renderer?: Renderer;
  private program?: Program;
  private geometry?: Plane;
  private readonly targetMouse = new Float32Array([-1000, -1000]);
  private readonly currentMouse = new Float32Array([-1000, -1000]);
  private targetInfluence = 0;
  private currentInfluence = 0;
  private readonly targetParallax = new Float32Array([0, 0]);
  private readonly currentParallax = new Float32Array([0, 0]);
  private readonly startTime = performance.now();

  private uniforms?: Record<string, { value: unknown }>;

  constructor(private readonly zone: NgZone) {}

  ngAfterViewInit(): void {
    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (this.reducedMotion) return;

    const container = this.containerRef.nativeElement;
    if (!container) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    this.renderer = new Renderer({
      dpr,
      alpha: false,
      depth: false,
      antialias: false,
      webgl: 2,
    });

    const gl = this.renderer.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.setAttribute('role', 'presentation');
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    gl.clearColor(0.02, 0.05, 0.08, 1);

    const camera = new Camera(gl, { left: -1, right: 1, bottom: -1, top: 1, near: 0.1, far: 100 });
    camera.position.z = 1;

    const totalLines = this.computeTotalLineCount();

    const gradientStops = this.linesGradient?.slice(0, 8) ?? [];
    const gradientRgb = Array.from({ length: 8 }, (_, i) =>
      i < gradientStops.length ? hexToRgbTriplet(gradientStops[i]) : [1, 1, 1]
    );

    this.uniforms = {
      iTime: { value: 0 },
      iResolution: { value: new Float32Array([1, 1, 1]) },
      animationSpeed: { value: this.animationSpeed },

      iMouse: { value: this.currentMouse },
      interactive: { value: this.interactive ? 1 : 0 },
      bendRadius: { value: this.bendRadius },
      bendStrength: { value: this.bendStrength },
      bendInfluence: { value: 0 },

      parallax: { value: this.parallax ? 1 : 0 },
      parallaxOffset: { value: this.currentParallax },

      lineGradient: { value: gradientRgb },
      lineGradientCount: { value: gradientStops.length },

      uLineCount: { value: totalLines },
    };

    this.program = new Program(gl, {
      vertex: FLOATING_LINES_VERTEX,
      fragment: FLOATING_LINES_FRAGMENT,
      uniforms: this.uniforms,
      transparent: false,
      cullFace: false,
      depthTest: false,
      depthWrite: false,
    });

    this.geometry = new Plane(gl, { width: 2, height: 2 });
    const mesh = new Mesh(gl, { geometry: this.geometry, program: this.program });
    const scene = new Transform();
    mesh.setParent(scene);

    const setSize = () => {
      if (this.destroyed || !this.renderer) return;
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      this.renderer.setSize(w, h);
      const bw = canvas.width;
      const bh = canvas.height;
      (this.uniforms!['iResolution'].value as Float32Array).set([bw, bh, 1]);
    };

    setSize();

    this.resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            if (!this.destroyed) setSize();
          })
        : undefined;
    this.resizeObserver?.observe(container);

    const damping = this.mouseDamping;

    const onPointerMove = (event: PointerEvent) => {
      if (!this.renderer || !this.uniforms) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const pdpr = this.renderer.dpr;
      this.targetMouse[0] = x * pdpr;
      this.targetMouse[1] = (rect.height - y) * pdpr;
      this.targetInfluence = 1;

      if (this.parallax) {
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const ox = (x - cx) / rect.width;
        const oy = -(y - cy) / rect.height;
        this.targetParallax[0] = ox * this.parallaxStrength;
        this.targetParallax[1] = oy * this.parallaxStrength;
      }
    };

    const onPointerLeave = () => {
      this.targetInfluence = 0;
    };

    if (this.interactive) {
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerleave', onPointerLeave);
    }

    const renderLoop = () => {
      if (this.destroyed || !this.renderer || !this.program || !this.uniforms) return;
      if (typeof document !== 'undefined' && document.hidden) {
        this.rafId = 0;
        return;
      }

      this.uniforms['iTime'].value = (performance.now() - this.startTime) / 1000;

      if (this.interactive) {
        this.currentMouse[0] += (this.targetMouse[0] - this.currentMouse[0]) * damping;
        this.currentMouse[1] += (this.targetMouse[1] - this.currentMouse[1]) * damping;
        this.currentInfluence += (this.targetInfluence - this.currentInfluence) * damping;
        this.uniforms['bendInfluence'].value = this.currentInfluence;
      }

      if (this.parallax) {
        this.currentParallax[0] += (this.targetParallax[0] - this.currentParallax[0]) * damping;
        this.currentParallax[1] += (this.targetParallax[1] - this.currentParallax[1]) * damping;
      }

      this.renderer.render({ scene, camera });
      this.rafId = requestAnimationFrame(renderLoop);
    };

    const resumeLoop = () => {
      if (this.destroyed || this.rafId) return;
      this.zone.runOutsideAngular(() => {
        this.rafId = requestAnimationFrame(renderLoop);
      });
    };

    const onVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        if (this.rafId) {
          cancelAnimationFrame(this.rafId);
          this.rafId = 0;
        }
      } else {
        resumeLoop();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
      this.teardownFns.push(() => document.removeEventListener('visibilitychange', onVisibility));
    }

    this.zone.runOutsideAngular(() => {
      this.rafId = requestAnimationFrame(renderLoop);
    });

    this.teardownFns.push(() => {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();

    for (const fn of this.teardownFns) fn();
    this.teardownFns.length = 0;

    const container = this.containerRef?.nativeElement;
    const canvas = this.renderer?.gl?.canvas as HTMLCanvasElement | undefined;
    if (canvas?.parentElement === container) {
      container.removeChild(canvas);
    }

    this.program?.remove();
    this.geometry?.remove();

    const lose = this.renderer?.gl?.getExtension('WEBGL_lose_context') as
      | WEBGL_lose_context
      | undefined;
    lose?.loseContext();

    this.renderer = undefined;
    this.program = undefined;
    this.geometry = undefined;
  }

  private computeTotalLineCount(): number {
    const waves = this.enabledWaves.length ? this.enabledWaves.length : 3;
    let sum: number;
    if (typeof this.lineCount === 'number') {
      sum = Math.max(4, this.lineCount * waves);
    } else {
      const arr = this.lineCount;
      sum = 0;
      for (let i = 0; i < waves; i++) {
        sum += arr[i] ?? arr[arr.length - 1] ?? 6;
      }
      sum = Math.max(6, sum);
    }
    return Math.min(MAX_LINES_SHADER, sum);
  }
}

function hexToRgbTriplet(hex: string): [number, number, number] {
  let v = hex.trim();
  if (v.startsWith('#')) v = v.slice(1);
  let r = 255;
  let g = 255;
  let b = 255;
  if (v.length === 3) {
    r = parseInt(v[0] + v[0], 16);
    g = parseInt(v[1] + v[1], 16);
    b = parseInt(v[2] + v[2], 16);
  } else if (v.length >= 6) {
    r = parseInt(v.slice(0, 2), 16);
    g = parseInt(v.slice(2, 4), 16);
    b = parseInt(v.slice(4, 6), 16);
  }
  return [r / 255, g / 255, b / 255];
}

interface WEBGL_lose_context {
  loseContext(): void;
}
