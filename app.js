const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  state: document.getElementById("state"),
  score: document.getElementById("score"),
  lives: document.getElementById("lives"),
  level: document.getElementById("level"),
  best: document.getElementById("best"),
};

const colors = {
  bg: "#030706",
  safe: "#123025",
  road: "#1a1d25",
  river: "#06364a",
  line: "#24463a",
  frog: "#82f96d",
  car: "#ff5d5d",
  truck: "#ffd95a",
  yellow: "#ffd95a",
  log: "#9d6838",
  turtle: "#35c8ff",
  home: "#1e6e45",
  ink: "#f0fff8",
  pink: "#ff5fa2",
};

const keys = new Set();
const cell = 60;
const cols = 12;
const rows = 13;
const best = Number(localStorage.getItem("froggerforge-best") || 0);
ui.best.textContent = best;

let last = performance.now();
let game;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function drawText(text, x, y, size, color, align = "center") {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.font = `${size}px "Press Start 2P", monospace`;
  ctx.fillText(text, x, y);
  ctx.restore();
}

class FroggerForge {
  constructor() {
    this.reset();
  }

  reset() {
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.status = "Ready";
    this.started = false;
    this.homes = new Set();
    this.safeTimer = 0;
    this.spawnLevel();
  }

  spawnLevel() {
    this.timeLimit = Math.max(36, 58 - this.level * 2);
    this.time = this.timeLimit;
    this.frog = {
      col: 5,
      row: 12,
      x: 5 * cell + cell / 2,
      y: 12 * cell + cell / 2,
      size: 34,
      ride: 0,
    };
    this.lanes = [
      { row: 1, type: "river", dir: 1, speed: 50 + this.level * 5, gap: 270, items: this.makeLane(1, [185, 230], colors.log, 0, 270) },
      { row: 2, type: "river", dir: -1, speed: 62 + this.level * 5, gap: 250, items: this.makeLane(2, [150, 190], colors.turtle, 80, 250) },
      { row: 3, type: "river", dir: 1, speed: 45 + this.level * 5, gap: 290, items: this.makeLane(3, [210, 260], colors.log, 30, 290) },
      { row: 4, type: "river", dir: -1, speed: 72 + this.level * 6, gap: 260, items: this.makeLane(4, [155, 205], colors.turtle, 20, 260) },
      { row: 6, type: "road", dir: -1, speed: 78 + this.level * 7, gap: 310, items: this.makeLane(6, [50, 68], colors.car, 0, 310) },
      { row: 7, type: "road", dir: 1, speed: 66 + this.level * 6, gap: 340, items: this.makeLane(7, [88, 118], colors.truck, 72, 340) },
      { row: 8, type: "road", dir: -1, speed: 88 + this.level * 7, gap: 330, items: this.makeLane(8, [48, 64], colors.pink, 110, 330) },
      { row: 9, type: "road", dir: 1, speed: 74 + this.level * 6, gap: 350, items: this.makeLane(9, [105, 145], colors.car, 45, 350) },
      { row: 10, type: "road", dir: -1, speed: 58 + this.level * 6, gap: 370, items: this.makeLane(10, [145, 185], colors.truck, 140, 370) },
    ];
  }

  makeLane(row, widths, color, offset, gap) {
    const items = [];
    for (let x = -offset; x < canvas.width + gap; x += gap) {
      const w = widths[Math.floor(Math.random() * widths.length)];
      items.push({ x, y: row * cell + 10, w, h: cell - 20, color });
    }
    return items;
  }

  start() {
    if (this.status === "Game Over") this.reset();
    this.started = true;
    this.status = "Playing";
  }

  move(dx, dy) {
    if (!this.started) this.start();
    if (this.status !== "Playing") return;
    this.frog.col = clamp(this.frog.col + dx, 0, cols - 1);
    this.frog.row = clamp(this.frog.row + dy, 0, rows - 1);
    this.frog.x = this.frog.col * cell + cell / 2;
    this.frog.y = this.frog.row * cell + cell / 2;
    this.safeTimer = 0.08;
    if (dy < 0) this.score += 10;
  }

  update(dt) {
    if (!this.started || this.status === "Game Over") return;
    this.safeTimer = Math.max(0, this.safeTimer - dt);
    this.time -= dt;
    if (this.time <= 0) this.killFrog();
    this.frog.ride = 0;
    this.lanes.forEach((lane) => {
      lane.items.forEach((item) => {
        item.x += lane.dir * lane.speed * dt;
        if (lane.dir > 0 && item.x > canvas.width + 40) item.x = -item.w - lane.gap * 0.62;
        if (lane.dir < 0 && item.x + item.w < -40) item.x = canvas.width + lane.gap * 0.62;
      });
    });
    this.resolveLane();
    this.checkHome();
  }

  resolveLane() {
    const lane = this.lanes.find((entry) => entry.row === this.frog.row);
    if (!lane) return;
    const frogRect = this.frogRect();
    if (lane.type === "road") {
      if (this.safeTimer <= 0 && lane.items.some((item) => rectsOverlap(frogRect, this.hitbox(item, 0.72)))) this.killFrog();
      return;
    }

    const platform = lane.items.find((item) => rectsOverlap(frogRect, this.hitbox(item, 1.08)));
    if (!platform) {
      if (this.safeTimer <= 0) this.killFrog();
      return;
    }
    this.frog.ride = lane.dir * lane.speed;
    this.frog.x += this.frog.ride / 60;
    this.frog.col = clamp(Math.floor(this.frog.x / cell), 0, cols - 1);
    if (this.frog.x < 0 || this.frog.x > canvas.width) this.killFrog();
  }

  hitbox(item, scale) {
    const w = item.w * scale;
    const h = item.h * scale;
    return {
      x: item.x + (item.w - w) / 2,
      y: item.y + (item.h - h) / 2,
      w,
      h,
    };
  }

  checkHome() {
    if (this.frog.row !== 0) return;
    const home = Math.round((this.frog.col - 1) / 2);
    const valid = [0, 1, 2, 3, 4].includes(home) && Math.abs(this.frog.col - (1 + home * 2)) <= 0;
    if (!valid || this.homes.has(home)) {
      this.killFrog();
      return;
    }
    this.homes.add(home);
    this.score += 500 + Math.floor(this.time) * 10;
    if (this.homes.size === 5) {
      this.level += 1;
      this.score += 1000;
      this.homes.clear();
      this.spawnLevel();
    } else {
      this.resetFrog();
    }
  }

  killFrog() {
    this.lives -= 1;
    if (this.lives <= 0) {
      this.status = "Game Over";
      this.started = false;
      const prior = Number(localStorage.getItem("froggerforge-best") || 0);
      if (this.score > prior) localStorage.setItem("froggerforge-best", String(this.score));
      ui.best.textContent = Math.max(prior, this.score);
      return;
    }
    this.resetFrog();
  }

  resetFrog() {
    this.frog.col = 5;
    this.frog.row = 12;
    this.frog.x = 5 * cell + cell / 2;
    this.frog.y = 12 * cell + cell / 2;
    this.safeTimer = 0.7;
  }

  frogRect() {
    return {
      x: this.frog.x - this.frog.size / 2,
      y: this.frog.y - this.frog.size / 2,
      w: this.frog.size,
      h: this.frog.size,
    };
  }

  draw() {
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.drawBoard();
    this.drawHomes();
    this.lanes.forEach((lane) => lane.items.forEach((item) => this.drawItem(item, lane.type)));
    this.drawFrog();
    this.drawTimer();
    if (!this.started) this.drawOverlay();
  }

  drawBoard() {
    for (let r = 0; r < rows; r += 1) {
      ctx.fillStyle = [0, 5, 11, 12].includes(r) ? colors.safe : r < 5 ? colors.river : colors.road;
      ctx.fillRect(0, r * cell, canvas.width, cell);
    }
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1;
    for (let r = 0; r <= rows; r += 1) {
      ctx.beginPath();
      ctx.moveTo(0, r * cell);
      ctx.lineTo(canvas.width, r * cell);
      ctx.stroke();
    }
  }

  drawHomes() {
    for (let i = 0; i < 5; i += 1) {
      const x = (1 + i * 2) * cell + cell / 2;
      ctx.fillStyle = this.homes.has(i) ? colors.frog : colors.home;
      ctx.beginPath();
      ctx.arc(x, cell / 2, 22, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawItem(item, type) {
    ctx.save();
    ctx.fillStyle = item.color;
    ctx.shadowColor = item.color;
    ctx.shadowBlur = 12;
    if (type === "river") {
      ctx.fillRect(item.x, item.y + 8, item.w, item.h - 16);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(item.x + 12, item.y + 18, Math.max(16, item.w - 24), 4);
    } else {
      ctx.fillRect(item.x, item.y, item.w, item.h);
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.fillRect(item.x + 8, item.y + 8, 18, 10);
      ctx.fillRect(item.x + item.w - 26, item.y + 8, 18, 10);
    }
    ctx.restore();
  }

  drawFrog() {
    ctx.save();
    ctx.translate(this.frog.x, this.frog.y);
    ctx.fillStyle = colors.frog;
    ctx.shadowColor = colors.frog;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.ink;
    ctx.beginPath();
    ctx.arc(-7, -8, 4, 0, Math.PI * 2);
    ctx.arc(7, -8, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawTimer() {
    ctx.fillStyle = colors.yellow;
    ctx.fillRect(18, canvas.height - 22, clamp(this.time / this.timeLimit, 0, 1) * 210, 8);
  }

  drawOverlay() {
    ctx.save();
    ctx.fillStyle = "rgba(3,7,6,0.78)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawText(this.status === "Game Over" ? "GAME OVER" : "FROGGERFORGE", canvas.width / 2, 340, 24, this.status === "Game Over" ? colors.car : colors.frog);
    drawText("CLICK / TAP / ARROWS TO START", canvas.width / 2, 395, 12, colors.yellow);
    ctx.restore();
  }
}

function updateUi() {
  ui.state.textContent = game.status;
  ui.score.textContent = game.score;
  ui.lives.textContent = game.lives;
  ui.level.textContent = game.level;
}

function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.033);
  last = now;
  game.update(dt);
  game.draw();
  updateUi();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  if (event.code === "KeyR") game.reset();
  if (keys.has(event.code)) return;
  keys.add(event.code);
  if (event.code === "ArrowUp" || event.code === "KeyW") game.move(0, -1);
  if (event.code === "ArrowDown" || event.code === "KeyS") game.move(0, 1);
  if (event.code === "ArrowLeft" || event.code === "KeyA") game.move(-1, 0);
  if (event.code === "ArrowRight" || event.code === "KeyD") game.move(1, 0);
  if (event.code === "Space") game.start();
});

window.addEventListener("keyup", (event) => keys.delete(event.code));

function pointerMove(event) {
  const rect = canvas.getBoundingClientRect();
  const source = event.touches ? event.touches[0] : event;
  const x = ((source.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((source.clientY - rect.top) / rect.height) * canvas.height;
  const col = clamp(Math.floor(x / cell), 0, cols - 1);
  const row = clamp(Math.floor(y / cell), 0, rows - 1);
  const dx = col - game.frog.col;
  const dy = row - game.frog.row;
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) === 1) game.move(Math.sign(dx), 0);
  else if (Math.abs(dy) === 1) game.move(0, Math.sign(dy));
  else game.start();
}

canvas.addEventListener("pointerdown", pointerMove);
canvas.addEventListener(
  "touchstart",
  (event) => {
    event.preventDefault();
    pointerMove(event);
  },
  { passive: false }
);

game = new FroggerForge();
requestAnimationFrame(loop);
