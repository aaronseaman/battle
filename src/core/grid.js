// Uniform spatial hash for enemy queries. Rebuilt once per tick (cheap: just
// resets array lengths), queried by towers and projectiles.

export class SpatialGrid {
  constructor(w, h, cell) {
    this.cell = cell;
    this.cols = Math.ceil(w / cell);
    this.rows = Math.ceil(h / cell);
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
  }

  clear() {
    const c = this.cells;
    for (let i = 0; i < c.length; i++) c[i].length = 0;
  }

  // Entities outside the world are clamped into edge cells; queries clamp the
  // same way, so results stay correct.
  insert(e) {
    let cx = Math.floor(e.x / this.cell);
    let cy = Math.floor(e.y / this.cell);
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1;
    this.cells[cy * this.cols + cx].push(e);
  }

  // Fills `out` with live entities whose circle overlaps (x, y, r). Returns count.
  query(x, y, r, out) {
    out.length = 0;
    const cs = this.cell;
    // pad by the largest normal enemy radius so overlap tests near cell edges work
    const pad = r + 64;
    let x0 = Math.floor((x - pad) / cs), x1 = Math.floor((x + pad) / cs);
    let y0 = Math.floor((y - pad) / cs), y1 = Math.floor((y + pad) / cs);
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 >= this.cols) x1 = this.cols - 1;
    if (y1 >= this.rows) y1 = this.rows - 1;
    for (let cy = y0; cy <= y1; cy++) {
      const row = cy * this.cols;
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells[row + cx];
        for (let i = 0; i < cell.length; i++) {
          const e = cell[i];
          if (!e.alive) continue;
          const dx = e.x - x, dy = e.y - y, rr = r + e.r;
          if (dx * dx + dy * dy <= rr * rr) out.push(e);
        }
      }
    }
    return out.length;
  }
}
