'use client';

import { useEffect, useId, useRef, useState } from 'react';

import type { CSSProperties, ReactNode } from 'react';

/*
 * Hanging-tile physics, ported from the design source's `withLanyard` override: each tile drops
 * in on an elastic thread, sways, and can be grabbed and flung. The server renders tiles at rest
 * with a straight thread, so nothing depends on the animation loop to be seen.
 */

const SEGMENTS = 16;
const GRAVITY = 2600;
const STIFFNESS = 360;
const RADIAL_DAMP = 9;
const AIR = 0.7;
const HEADROOM = 36;
const MAX_DT = 0.033;

interface Drag {
  on: boolean;
  tx: number;
  ty: number;
  gx: number;
  gy: number;
  pvx: number;
  pvy: number;
  lx: number;
  ly: number;
  lt: number;
}

interface Sim {
  w: number;
  L0: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  vx: number;
  vy: number;
  rot: number;
  av: number;
  pts: Float32Array;
  prev: Float32Array;
  startAt: number;
  started: boolean;
  phase: number;
  drag: Drag;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function distanceToSection(el: HTMLElement, section: HTMLElement): number {
  let total = 0;
  let node: HTMLElement | null = el;
  while (node !== null && node !== section) {
    total += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return node === section
    ? total
    : el.getBoundingClientRect().top - section.getBoundingClientRect().top;
}

function ropePath(sim: Sim): string {
  const p = sim.pts;
  let d = `M${(p[0] ?? 0).toFixed(1)} ${(p[1] ?? 0).toFixed(1)}`;
  for (let i = 1; i < SEGMENTS; i++) {
    const x = p[i * 2] ?? 0;
    const y = p[i * 2 + 1] ?? 0;
    const mx = (x + (p[i * 2 + 2] ?? 0)) / 2;
    const my = (y + (p[i * 2 + 3] ?? 0)) / 2;
    d += ` Q${x.toFixed(1)} ${y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  return `${d} L${sim.bx.toFixed(1)} ${sim.by.toFixed(1)}`;
}

export interface LanyardProps {
  readonly children: ReactNode;
  readonly className?: string | undefined;
  readonly style?: CSSProperties;
  readonly label?: string;
}

export function Lanyard({ children, className, style, label }: LanyardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const knotRef = useRef<SVGCircleElement>(null);
  const gradRef = useRef<SVGLinearGradientElement>(null);
  const gradientId = `lanyard-${useId().replace(/:/g, '')}`;
  const [rest, setRest] = useState<{ length: number; width: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const section = el.closest('section') ?? document.body;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let sim: Sim | null = null;
    let raf = 0;
    let last = performance.now();
    let visible = true;

    const measure = () => {
      if (el.offsetWidth === 0) return;
      const w = el.offsetWidth;
      const L = distanceToSection(el, section) + HEADROOM;
      setRest({ length: L, width: w });
      const L0 = Math.max(20, L - GRAVITY / STIFFNESS);
      if (sim !== null) {
        sim.w = w;
        sim.L0 = L0;
        sim.ax = w / 2;
        sim.ay = -L;
        return;
      }
      const sectionRect = section.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      const offCentre =
        Math.abs(rect.left + w / 2 - (sectionRect.left + sectionRect.width / 2)) /
        Math.max(1, sectionRect.width);
      const ax = w / 2;
      const ay = -L;
      const bx = reduce ? ax : ax + (Math.random() - 0.5) * 50;
      const by = reduce ? 0 : ay - 24;
      const pts = new Float32Array((SEGMENTS + 1) * 2);
      for (let i = 0; i <= SEGMENTS; i++) {
        pts[i * 2] = ax + ((bx - ax) * i) / SEGMENTS;
        pts[i * 2 + 1] = reduce ? ay + (L * i) / SEGMENTS : ay + ((by - ay) * i) / SEGMENTS;
      }
      sim = {
        w,
        L0,
        ax,
        ay,
        bx,
        by,
        vx: 0,
        vy: 0,
        rot: 0,
        av: 0,
        pts,
        prev: pts.slice(),
        startAt: performance.now() + (reduce ? 0 : (0.25 + offCentre * 1.3) * 1000),
        started: reduce,
        phase: Math.random() * Math.PI * 2,
        drag: { on: false, tx: 0, ty: 0, gx: 0, gy: 0, pvx: 0, pvy: 0, lx: 0, ly: 0, lt: 0 },
      };
    };

    const render = (s: Sim) => {
      el.style.transform = `translate(${(s.bx - s.w / 2).toFixed(1)}px, ${s.by.toFixed(1)}px) rotate(${s.rot.toFixed(2)}deg)`;
      pathRef.current?.setAttribute('d', ropePath(s));
      knotRef.current?.setAttribute('cx', s.bx.toFixed(1));
      knotRef.current?.setAttribute('cy', s.by.toFixed(1));
      const g = gradRef.current;
      if (g !== null) {
        g.setAttribute('x1', String(s.ax));
        g.setAttribute('y1', String(s.ay));
        g.setAttribute('x2', s.bx.toFixed(1));
        g.setAttribute('y2', s.by.toFixed(1));
      }
    };

    const step = (s: Sim, dt: number, now: number) => {
      if (!s.started) {
        // Stay at rest until the drop begins, so a stalled loop never leaves a tile mid-air.
        if (now < s.startAt) return;
        s.started = true;
      }
      const t = now / 1000;
      if (s.drag.on) {
        let tx = s.drag.tx;
        let ty = s.drag.ty;
        const dx = tx - s.ax;
        const dy = ty - s.ay;
        const dd = Math.hypot(dx, dy) || 1;
        const cap = s.L0 * 1.06 + 28;
        if (dd > cap) {
          const k = cap + (dd - cap) * 0.12;
          tx = s.ax + (dx / dd) * k;
          ty = s.ay + (dy / dd) * k;
        }
        const nx = s.bx + (tx - s.bx) * 0.45;
        const ny = s.by + (ty - s.by) * 0.45;
        s.vx = (nx - s.bx) / dt;
        s.vy = (ny - s.by) / dt;
        s.bx = nx;
        s.by = ny;
      } else {
        const sub = 4;
        const h = dt / sub;
        for (let k = 0; k < sub; k++) {
          let fx = reduce ? 0 : Math.sin(t * 0.8 + s.phase) * 26;
          let fy = GRAVITY;
          const dx = s.bx - s.ax;
          const dy = s.by - s.ay;
          const d = Math.hypot(dx, dy) || 1;
          const nx = dx / d;
          const ny = dy / d;
          if (d > s.L0) {
            const ext = d - s.L0;
            const vr = s.vx * nx + s.vy * ny;
            fx -= STIFFNESS * ext * nx + RADIAL_DAMP * vr * nx;
            fy -= STIFFNESS * ext * ny + RADIAL_DAMP * vr * ny;
          }
          s.vx = (s.vx + fx * h) * (1 - AIR * h);
          s.vy = (s.vy + fy * h) * (1 - AIR * h);
          s.bx += s.vx * h;
          s.by += s.vy * h;
          const ex = s.bx - s.ax;
          const ey = s.by - s.ay;
          const ed = Math.hypot(ex, ey) || 1;
          const hard = s.L0 * 1.2 + 40;
          if (ed > hard) {
            s.bx = s.ax + (ex / ed) * hard;
            s.by = s.ay + (ey / ed) * hard;
            const vr = (s.vx * ex + s.vy * ey) / ed;
            if (vr > 0) {
              s.vx -= (1.4 * vr * ex) / ed;
              s.vy -= (1.4 * vr * ey) / ed;
            }
          }
        }
      }
      const p = s.pts;
      const q = s.prev;
      p[0] = s.ax;
      p[1] = s.ay;
      p[SEGMENTS * 2] = s.bx;
      p[SEGMENTS * 2 + 1] = s.by;
      for (let i = 1; i < SEGMENTS; i++) {
        const ix = i * 2;
        const vx = ((p[ix] ?? 0) - (q[ix] ?? 0)) * 0.96;
        const vy = ((p[ix + 1] ?? 0) - (q[ix + 1] ?? 0)) * 0.96;
        q[ix] = p[ix] ?? 0;
        q[ix + 1] = p[ix + 1] ?? 0;
        p[ix] = (p[ix] ?? 0) + vx;
        p[ix + 1] = (p[ix + 1] ?? 0) + vy + GRAVITY * 0.6 * dt * dt;
      }
      const span = Math.hypot(s.bx - s.ax, s.by - s.ay);
      const seg = (span >= s.L0 ? span * 0.992 : s.L0) / SEGMENTS;
      const solve = (i: number) => {
        const a = i * 2;
        const b = a + 2;
        const dx = (p[b] ?? 0) - (p[a] ?? 0);
        const dy = (p[b + 1] ?? 0) - (p[a + 1] ?? 0);
        const d = Math.hypot(dx, dy) || 1;
        const diff = (d - seg) / d;
        const wa = i === 0 ? 0 : i + 1 === SEGMENTS ? 1 : 0.5;
        const wb = i + 1 === SEGMENTS ? 0 : i === 0 ? 1 : 0.5;
        p[a] = (p[a] ?? 0) + dx * diff * wa;
        p[a + 1] = (p[a + 1] ?? 0) + dy * diff * wa;
        p[b] = (p[b] ?? 0) - dx * diff * wb;
        p[b + 1] = (p[b + 1] ?? 0) - dy * diff * wb;
      };
      for (let it = 0; it < 12; it++) {
        for (let i = 0; i < SEGMENTS; i++) solve(i);
        for (let i = SEGMENTS - 1; i >= 0; i--) solve(i);
      }
      if (span >= s.L0) {
        const k = Math.min(1, (span - s.L0) / 8) * 0.3;
        for (let i = 1; i < SEGMENTS; i++) {
          const f = i / SEGMENTS;
          p[i * 2] = (p[i * 2] ?? 0) + (s.ax + (s.bx - s.ax) * f - (p[i * 2] ?? 0)) * k;
          p[i * 2 + 1] = (p[i * 2 + 1] ?? 0) + (s.ay + (s.by - s.ay) * f - (p[i * 2 + 1] ?? 0)) * k;
        }
      }
      const px = p[(SEGMENTS - 2) * 2] ?? s.ax;
      const py = p[(SEGMENTS - 2) * 2 + 1] ?? s.ay;
      const local = -Math.atan2(s.bx - px, Math.max(4, s.by - py));
      const global = -Math.atan2(s.bx - s.ax, Math.max(4, s.by - s.ay));
      let target = ((local * 0.45 + global * 0.55) * 180) / Math.PI;
      target += clamp(-s.vx * 0.004, -10, 10);
      target = clamp(target, -55, 55);
      s.av += ((target - s.rot) * 110 - s.av * 13) * dt;
      s.rot = clamp(s.rot + s.av * dt, -70, 70);
      render(s);
    };

    const loop = (now: number) => {
      const dt = Math.min(MAX_DT, Math.max(0.001, (now - last) / 1000));
      last = now;
      if (sim !== null && visible) step(sim, dt, now);
      raf = requestAnimationFrame(loop);
    };

    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(section);
    resize.observe(el);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    io.observe(section);
    const start = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', start);
      last = performance.now();
      if (sim !== null && !sim.started) sim.startAt = last + (sim.startAt - last > 0 ? 250 : 0);
      raf = requestAnimationFrame(loop);
    };
    if (document.visibilityState === 'visible') raf = requestAnimationFrame(loop);
    else document.addEventListener('visibilitychange', start);

    const origin = () => {
      const parent = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect();
      return { ox: (parent?.left ?? 0) + el.offsetLeft, oy: (parent?.top ?? 0) + el.offsetTop };
    };
    const onMove = (event: PointerEvent) => {
      if (!sim?.drag.on) return;
      const { ox, oy } = origin();
      const lx = event.clientX - ox;
      const ly = event.clientY - oy;
      const now = performance.now();
      const dt = Math.max(8, now - sim.drag.lt) / 1000;
      sim.drag.pvx = sim.drag.pvx * 0.4 + ((lx - sim.drag.lx) / dt) * 0.6;
      sim.drag.pvy = sim.drag.pvy * 0.4 + ((ly - sim.drag.ly) / dt) * 0.6;
      sim.drag.lx = lx;
      sim.drag.ly = ly;
      sim.drag.lt = now;
      sim.drag.tx = lx - sim.drag.gx;
      sim.drag.ty = ly - sim.drag.gy;
    };
    const onUp = () => {
      if (sim !== null) {
        sim.drag.on = false;
        sim.vx = clamp(sim.drag.pvx * 0.6, -1500, 1500);
        sim.vy = clamp(sim.drag.pvy * 0.6, -900, 1500);
      }
      el.style.zIndex = '';
      el.style.cursor = 'grab';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    const onDown = (event: PointerEvent) => {
      if (!sim?.started) return;
      event.preventDefault();
      const { ox, oy } = origin();
      const lx = event.clientX - ox;
      const ly = event.clientY - oy;
      sim.drag = {
        on: true,
        gx: lx - sim.bx,
        gy: ly - sim.by,
        tx: sim.bx,
        ty: sim.by,
        pvx: 0,
        pvy: 0,
        lx,
        ly,
        lt: performance.now(),
      };
      el.style.zIndex = '20';
      el.style.cursor = 'grabbing';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };
    el.addEventListener('pointerdown', onDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', start);
      resize.disconnect();
      io.disconnect();
      el.removeEventListener('pointerdown', onDown);
      onUp();
    };
  }, []);

  const restPath =
    rest === null
      ? undefined
      : `M${(rest.width / 2).toString()} ${(-rest.length).toString()} L${(rest.width / 2).toString()} 0`;

  return (
    <div className={className} style={{ ...style, position: 'absolute', isolation: 'isolate' }}>
      {rest !== null && (
        <svg
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: rest.width,
            height: 1,
            overflow: 'visible',
            pointerEvents: 'none',
            zIndex: -1,
          }}
        >
          <defs>
            <linearGradient
              id={gradientId}
              ref={gradRef}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1={-rest.length}
              x2="0"
              y2="0"
            >
              <stop offset="0%" style={{ stopColor: 'var(--thread)', stopOpacity: 0 }} />
              <stop offset="30%" style={{ stopColor: 'var(--thread)', stopOpacity: 0.9 }} />
              <stop offset="100%" style={{ stopColor: 'var(--thread)', stopOpacity: 1 }} />
            </linearGradient>
          </defs>
          <path
            ref={pathRef}
            d={restPath}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <circle
            ref={knotRef}
            cx={rest.width / 2}
            cy={0}
            r={2.6}
            style={{ fill: 'var(--knot)' }}
          />
        </svg>
      )}
      <div
        ref={ref}
        style={{
          transformOrigin: '50% 0%',
          cursor: 'grab',
          touchAction: 'none',
          userSelect: 'none',
        }}
        role={label === undefined ? undefined : 'img'}
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}
