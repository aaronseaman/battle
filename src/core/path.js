// Enemy path: a polyline with rounded corners, sampled by arc length.
// Each enemy keeps its segment index as a hint, so sampling is O(1) amortized.

export class Path {
  constructor(points, radius = 40, steps = 8) {
    const pts = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      const [px, py] = points[i - 1];
      const [cx, cy] = points[i];
      const [nx, ny] = points[i + 1];
      const l1 = Math.hypot(cx - px, cy - py);
      const l2 = Math.hypot(nx - cx, ny - cy);
      const r = Math.min(radius, l1 / 2, l2 / 2);
      const ax = cx - ((cx - px) / l1) * r, ay = cy - ((cy - py) / l1) * r;
      const bx = cx + ((nx - cx) / l2) * r, by = cy + ((ny - cy) / l2) * r;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, u = 1 - t;
        pts.push([u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by]);
      }
    }
    pts.push(points[points.length - 1]);

    // drop near-duplicate points
    const clean = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = clean[clean.length - 1];
      if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) > 0.5) clean.push(pts[i]);
    }

    const n = clean.length;
    this.n = n;
    this.xs = new Float64Array(n);
    this.ys = new Float64Array(n);
    this.cum = new Float64Array(n);
    this.ang = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.xs[i] = clean[i][0];
      this.ys[i] = clean[i][1];
      if (i > 0) this.cum[i] = this.cum[i - 1] + Math.hypot(this.xs[i] - this.xs[i - 1], this.ys[i] - this.ys[i - 1]);
    }
    for (let i = 0; i < n - 1; i++) this.ang[i] = Math.atan2(this.ys[i + 1] - this.ys[i], this.xs[i + 1] - this.xs[i]);
    this.ang[n - 1] = this.ang[n - 2];
    this.length = this.cum[n - 1];
  }

  // Writes x, y, angle into `out`; returns the segment index to reuse as `hint`.
  sample(dist, out, hint = 0) {
    const cum = this.cum, last = this.n - 2;
    let i = hint | 0;
    if (i > last) i = last;
    if (i < 0) i = 0;
    while (i < last && cum[i + 1] < dist) i++;
    while (i > 0 && cum[i] > dist) i--;
    const len = cum[i + 1] - cum[i];
    let t = len > 0 ? (dist - cum[i]) / len : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    out.x = this.xs[i] + (this.xs[i + 1] - this.xs[i]) * t;
    out.y = this.ys[i] + (this.ys[i + 1] - this.ys[i]) * t;
    out.angle = this.ang[i];
    return i;
  }

  // Arc-length distance of the closest point on the path to (x, y), plus the gap.
  closest(x, y) {
    let best = Infinity, bestDist = 0;
    for (let i = 0; i < this.n - 1; i++) {
      const ax = this.xs[i], ay = this.ys[i];
      const dx = this.xs[i + 1] - ax, dy = this.ys[i + 1] - ay;
      const l2 = dx * dx + dy * dy;
      let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const px = ax + dx * t, py = ay + dy * t;
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < best) {
        best = d;
        bestDist = this.cum[i] + Math.sqrt(l2) * t;
      }
    }
    return { dist: bestDist, gap: Math.sqrt(best) };
  }

  // Total path length within `range` of (x, y) — used for socket coverage hints.
  coverage(x, y, range, step = 10) {
    const p = { x: 0, y: 0, angle: 0 };
    let covered = 0, h = 0;
    for (let d = 0; d < this.length; d += step) {
      h = this.sample(d, p, h);
      if ((p.x - x) ** 2 + (p.y - y) ** 2 <= range * range) covered += step;
    }
    return covered;
  }
}
