const canvas = document.getElementById('starfield');
const ctx = canvas.getContext('2d');

let W, H, stars = [];
const STAR_COUNT = 280;

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}

function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}

function createStar() {
  return {
    x: randomBetween(0, W),
    y: randomBetween(0, H),
    radius: randomBetween(0.2, 1.4),
    opacity: randomBetween(0.1, 0.9),
    // twinkle
    twinkleSpeed: randomBetween(0.003, 0.012),
    twinkleOffset: randomBetween(0, Math.PI * 2),
    // drift
    vx: randomBetween(-0.04, 0.04),
    vy: randomBetween(-0.015, 0.015),
    // color: mostly white-blue, a few warmer
    hue: Math.random() > 0.85 ? randomBetween(30, 50) : randomBetween(200, 230),
  };
}

function initStars() {
  stars = Array.from({ length: STAR_COUNT }, createStar);
}

let frame = 0;

function draw() {
  ctx.clearRect(0, 0, W, H);
  frame++;

  for (let s of stars) {
    // twinkle: oscillate opacity
    const twinkle = Math.sin(frame * s.twinkleSpeed + s.twinkleOffset);
    const alpha = Math.max(0.05, s.opacity + twinkle * 0.35);

    // drift
    s.x += s.vx;
    s.y += s.vy;

    // wrap around edges
    if (s.x < -2) s.x = W + 2;
    if (s.x > W + 2) s.x = -2;
    if (s.y < -2) s.y = H + 2;
    if (s.y > H + 2) s.y = -2;

    // draw
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${s.hue}, 60%, 90%, ${alpha})`;
    ctx.fill();

    // add a soft glow for brighter stars
    if (s.radius > 0.9 && alpha > 0.5) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius * 3, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${s.hue}, 70%, 85%, ${alpha * 0.08})`;
      ctx.fill();
    }
  }

  requestAnimationFrame(draw);
}

window.addEventListener('resize', () => {
  resize();
  initStars();
});

resize();
initStars();
draw();
