'use strict';

/* ============================================================
   LITERARY TIMELINE  —  script.js
   ============================================================ */

/* ── 1. CONFIG ──────────────────────────────────────────────
   Edit EVENTS to add/remove historical annotations per decade.
   Each decade maps to an array of event strings.
   ────────────────────────────────────────────────────────── */

const DECADES = ['1890', '1900', '1910', '1920', '1930', '1940', '1950', '1960', '1970', '1980', '1990', '2000'];

const EVENTS = {
  '1890': ['1st wave of the environmental movement'],
  '1900': [],
  '1910': ['World War I begins (1914)', 'Russian Revolution (1917)'],
  '1920': ['Prohibition Era (1920–1933)', "Women's suffrage in the US (1920)"],
  '1930': ['Wall Street Crash aftermath', 'The Great Depression'],
  '1940': ['World War II (1939–1945)', 'Atomic bombs on Japan (1945)'],
  '1950': ['Cold War tension escalates', 'Television becomes common in homes'],
  '1960': ['Civil Rights Movement', '2nd wave of the environmental movement'],
  '1970': [],
  '1980': [],
  '1990': ['End of Cold War', 'Rise of the Internet'],
  '2000': ['9/11 Attacks (2001)', 'Iraq War begins (2003)', 'Social media emerges'],
};

/* Pastel color per decade (salmon → lavender → blush) */
const PASTEL = [
  '#E8927C', '#F0A882', '#F5C07A', '#EDE07A',
  '#A8D8A8', '#7AD4C0', '#7ABFE8', '#8AB4F0',
  '#A898E8', '#C898D8', '#E898C0', '#E8A0A8',
];

/* Layout constants */
const STATION_W = 660;   // px — normal mode width
const STATION_C = 160;   // px — compact (subject) mode width
const DETAIL_W = 310;   // px — detail panel width
const DETAIL_GAP = 40;    // px — gap between previous station & panel
const MAX_WORDS = 30;    // word cloud word cap
const MAX_CHARS = 22;    // truncate subjects beyond this length
const FONT_MIN = 11;    // smallest font in cloud (px)
const FONT_MAX = 56;    // largest font in cloud (px)
const FREQ_H_MAX = 310;   // tallest frequency bar in subject mode (px)
const CLOUD_PAD = 30;    // inner padding of cloud canvas (px)
const TRANS_MS = 600;   // CSS transition duration + buffer (ms)
/* Computed layout values (must match CSS variables):
   --cloud-h    = window.innerHeight - 230
   --dot-area-h = 90
   --history-h  = 140  */
const DOT_AREA_H = 90;
const HISTORY_H = 140;

/* ── 2. STATE ─────────────────────────────────────────────── */

let rawData = {};
let appMode = 'timeline';  // 'timeline' | 'subject' | 'detail'
let selSubject = null;
let expandedDec = null;

// Per-decade DOM & data refs
const stEl = {};   // decade → .decade-station element
const canvasEl = {};   // decade → canvas element
const cloudData = {};   // decade → placed[] word objects
let hoveredInfo = null; // { dec, idx } | null

/* ── 3. TEXT UTILITIES ────────────────────────────────────── */

const _mc = document.createElement('canvas');
const _mct = _mc.getContext('2d');

/**
 * Measure rendered width of `text` at `fontSize` px in Inter.
 */
function measureW(text, fontSize) {
  _mct.font = `${fontSize}px Inter, sans-serif`;
  return _mct.measureText(text).width;
}

/**
 * Truncate a string to MAX_CHARS, appending ellipsis if needed.
 */
function truncate(str) {
  return str.length > MAX_CHARS ? str.slice(0, MAX_CHARS - 1) + '…' : str;
}

/**
 * Title-case a subject string.
 */
function capitalize(s) {
  return s.replace(/\b(\w)/g, c => c.toUpperCase());
}

/* ── 4. BOUNDING-BOX COLLISION ───────────────────────────── */

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh, pad = 8) {
  return !(ax + aw + pad < bx ||
    bx + bw + pad < ax ||
    ay + ah + pad < by ||
    by + bh + pad < ay);
}

/* ── 5. WORD CLOUD LAYOUT ALGORITHM ─────────────────────── */

/**
 * Archimedean-spiral layout.
 * Returns an array of placed word objects with {orig, disp, x, y, w, h, fs, freq}.
 * subjects must be sorted descending by frequency.
 */
function layoutCloud(subjects, cw, ch) {
  const result = [];
  if (!subjects.length) return result;

  const maxF = subjects[0].frequency;
  const minF = subjects[subjects.length - 1].frequency;
  const range = Math.max(maxF - minF, 1);
  const cx = cw / 2;
  const cy = ch * 0.50;   // spiral center

  for (const s of subjects) {
    const norm = (s.frequency - minF) / range;
    const fs = FONT_MIN + Math.pow(norm, 0.65) * (FONT_MAX - FONT_MIN);
    const disp = truncate(s.text);
    const w = measureW(disp, fs);
    const h = fs * 1.25;

    let found = false;
    for (let step = 0; step < 600; step++) {
      const angle = step * 0.42;
      const radius = step * 1.7;
      const x = cx + radius * Math.cos(angle) - w / 2;
      const y = cy + radius * Math.sin(angle) * 0.52 - h / 2;

      // Keep within padded bounds
      if (x < CLOUD_PAD || x + w > cw - CLOUD_PAD) continue;
      if (y < CLOUD_PAD || y + h > ch - CLOUD_PAD) continue;

      let bad = false;
      for (const p of result) {
        if (rectsOverlap(x, y, w, h, p.x, p.y, p.w, p.h)) { bad = true; break; }
      }
      if (!bad) {
        result.push({ orig: s.text, disp, x, y, w, h, fs, freq: s.frequency });
        found = true;
        break;
      }
    }
    // If no position found after 600 steps, word is skipped
    void found;
  }
  return result;
}

/* ── 6. CANVAS DRAWING ────────────────────────────────────── */

/**
 * Redraw the word-cloud canvas for a given decade.
 * Optionally highlight one word index.
 */
function redrawCloud(dec, highlightIdx = -1) {
  const cvs = canvasEl[dec];
  const rect = cvs.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const dpr = window.devicePixelRatio || 1;
  // Only resize if dimensions changed (avoids layout flash)
  const needW = Math.round(rect.width * dpr);
  const needH = Math.round(rect.height * dpr);
  if (cvs.width !== needW || cvs.height !== needH) {
    cvs.width = needW;
    cvs.height = needH;
  }

  const ctx = cvs.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const words = cloudData[dec] || [];
  if (!words.length) return;
  const maxF = words[0].freq;

  words.forEach((w, i) => {
    const ratio = w.freq / maxF;
    const isHit = i === highlightIdx;

    let color;
    if (isHit) {
      color = '#0055B3';                                       // highlight: blue
    } else {
      color = ratio >= 0.85 ? '#111111' :
        ratio >= 0.65 ? '#2A2A2A' :
          ratio >= 0.45 ? '#484848' :
            ratio >= 0.25 ? '#686868' : '#939393';
    }

    const weight = w.fs >= 28 ? '500 ' : '400 ';
    ctx.font = `${weight}${w.fs}px Inter, sans-serif`;
    ctx.fillStyle = color;
    // Baseline = top of box + ~85% of font size
    ctx.fillText(w.disp, w.x, w.y + w.fs * 0.86);
  });
}

/**
 * First-time draw: measure canvas, layout words, then draw.
 */
function initialDraw(dec) {
  const cvs = canvasEl[dec];
  const rect = cvs.getBoundingClientRect();
  const subjects = Object.entries(rawData[dec] || {})
    .map(([text, frequency]) => ({ text, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, MAX_WORDS);

  cloudData[dec] = layoutCloud(subjects, rect.width, rect.height);
  redrawCloud(dec);
}

/* ── 7. BUILD TIMELINE DOM ───────────────────────────────── */

function buildTimeline() {
  const track = document.getElementById('timeline-track');

  DECADES.forEach((dec, idx) => {

    /* Station */
    const station = document.createElement('div');
    station.className = 'decade-station';
    station.dataset.decade = dec;
    station.style.animationDelay = `${idx * 0.06}s`;
    stEl[dec] = station;

    /* Word-cloud canvas */
    const cvs = document.createElement('canvas');
    cvs.className = 'word-cloud-canvas';
    cvs.setAttribute('role', 'img');
    cvs.setAttribute('aria-label', `Word cloud for the ${dec}s`);
    canvasEl[dec] = cvs;
    cvs.addEventListener('click', onCanvasClick);
    cvs.addEventListener('mousemove', onCanvasMove);
    cvs.addEventListener('mouseleave', onCanvasLeave);

    /* Dot */
    const dotWrap = document.createElement('div');
    dotWrap.className = 'dot-wrapper';
    const dot = document.createElement('div');
    dot.className = 'timeline-dot';
    dot.dataset.decade = dec;
    dot.style.background = PASTEL[idx];
    dot.setAttribute('role', 'button');
    dot.setAttribute('aria-label', `Expand ${dec}s details`);
    dot.innerHTML = `<span class="decade-label">${dec}s</span>`;
    dot.addEventListener('click', () => onDotClick(dec));
    dotWrap.appendChild(dot);

    /* History notes */
    const hist = document.createElement('div');
    hist.className = 'history-area';
    (EVENTS[dec] || []).forEach(ev => {
      const n = document.createElement('div');
      n.className = 'history-note';
      n.textContent = ev;
      hist.appendChild(n);
    });

    /* Frequency indicator (Mode 2) */
    const freqInd = document.createElement('div');
    freqInd.className = 'freq-indicator';
    const freqLbl = document.createElement('div');
    freqLbl.className = 'freq-label';
    const freqBar = document.createElement('div');
    freqBar.className = 'freq-bar';
    freqInd.appendChild(freqLbl);
    freqInd.appendChild(freqBar);

    /* Detail panel (Mode 3) */
    const panel = document.createElement('div');
    panel.className = 'detail-panel';

    const panelDecade = document.createElement('div');
    panelDecade.className = 'detail-panel-decade';
    panelDecade.textContent = dec + 's';

    const panelLabel = document.createElement('div');
    panelLabel.className = 'detail-panel-label';
    panelLabel.textContent = 'Subjects by frequency';

    const listWrap = document.createElement('div');
    listWrap.className = 'detail-list-wrap';

    const list = document.createElement('div');
    list.className = 'detail-list';

    Object.entries(rawData[dec] || {})
      .sort((a, b) => b[1] - a[1])
      .forEach(([text, count]) => {
        const item = document.createElement('div');
        item.className = 'detail-item';
        item.title = text; // show full text on hover as native tooltip
        const nm = document.createElement('span');
        nm.className = 'item-name';
        nm.textContent = text;
        const ct = document.createElement('span');
        ct.className = 'item-count';
        ct.textContent = count;
        item.appendChild(nm);
        item.appendChild(ct);
        // Clicking a detail item launches the subject frequency view
        item.addEventListener('click', () => enterSubjectMode(text));
        list.appendChild(item);
      });

    listWrap.appendChild(list);
    panel.appendChild(panelDecade);
    panel.appendChild(panelLabel);
    panel.appendChild(listWrap);

    /* Assemble station */
    station.appendChild(cvs);
    station.appendChild(dotWrap);
    station.appendChild(hist);
    station.appendChild(freqInd);
    station.appendChild(panel);
    track.appendChild(station);
  });

  /* Draw clouds once fonts + layout are ready */
  document.fonts.ready.then(() => {
    requestAnimationFrame(() => {
      DECADES.forEach(dec => initialDraw(dec));
    });
  });

  /* Mouse-drag horizontal scroll */
  enableDragScroll();
}

/* ── 8. DRAG-TO-SCROLL ───────────────────────────────────── */

function enableDragScroll() {
  const container = document.getElementById('timeline-container');
  let isDragging = false, startX = 0, scrollStart = 0;

  container.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    isDragging = true;
    startX = e.clientX;
    scrollStart = container.scrollLeft;
  });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    container.scrollLeft = scrollStart - dx;
  });
  window.addEventListener('mouseup', () => { isDragging = false; });

  /* Redirect vertical scroll wheel to horizontal scroll.
   * Exception: if the wheel happens over the detail list, let it
   * scroll that list vertically instead (browser default). */
  container.addEventListener('wheel', e => {
    if (e.target.closest('.detail-list')) return;  // let list scroll naturally
    e.preventDefault();
    container.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
  }, { passive: false });
}

/* ── 9. EVENT HANDLERS ───────────────────────────────────── */

function onDotClick(dec) {
  if (appMode === 'subject') return;
  if (expandedDec === dec) {
    collapseDetail();
  } else {
    if (expandedDec) collapseDetail();
    expandDetail(dec);
  }
}

let _hoverRAF = null;

function onCanvasMove(e) {
  if (appMode !== 'timeline') return;
  if (_hoverRAF) return;   // throttle to rAF
  _hoverRAF = requestAnimationFrame(() => {
    _hoverRAF = null;
    const cvs = e.currentTarget;
    const dec = cvs.closest('.decade-station').dataset.decade;
    const r = cvs.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;

    let newIdx = -1;
    const words = cloudData[dec] || [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (mx >= w.x && mx <= w.x + w.w && my >= w.y && my <= w.y + w.h + 4) {
        newIdx = i;
        break;
      }
    }

    const prevInfo = hoveredInfo;
    hoveredInfo = newIdx >= 0 ? { dec, idx: newIdx } : null;

    const changed = (prevInfo?.dec !== hoveredInfo?.dec) ||
      (prevInfo?.idx !== hoveredInfo?.idx);
    if (changed) {
      // Redraw previous canvas if different decade
      if (prevInfo && prevInfo.dec !== dec) redrawCloud(prevInfo.dec);
      redrawCloud(dec, newIdx);
    }

    cvs.style.cursor = newIdx >= 0 ? 'pointer' : 'default';
  });
}

function onCanvasLeave(e) {
  const cvs = e.currentTarget;
  const dec = cvs.closest('.decade-station')?.dataset?.decade;
  if (hoveredInfo && hoveredInfo.dec === dec) {
    hoveredInfo = null;
    redrawCloud(dec);
  }
  cvs.style.cursor = 'default';
}

function onCanvasClick(e) {
  if (appMode !== 'timeline') return;
  const cvs = e.currentTarget;
  const dec = cvs.closest('.decade-station').dataset.decade;
  const r = cvs.getBoundingClientRect();
  const mx = e.clientX - r.left;
  const my = e.clientY - r.top;

  const words = cloudData[dec] || [];
  for (const w of words) {
    if (mx >= w.x && mx <= w.x + w.w && my >= w.y && my <= w.y + w.h + 4) {
      enterSubjectMode(w.orig);
      return;
    }
  }
}

/* ── 10. MODE 3 — DETAIL ─────────────────────────────────── */

function expandDetail(dec) {
  expandedDec = dec;
  appMode = 'detail';

  const station = stEl[dec];
  const panel = station.querySelector('.detail-panel');
  const dot = station.querySelector('.timeline-dot');

  station.style.marginLeft = (DETAIL_W + DETAIL_GAP) + 'px';
  panel.classList.add('visible');
  dot.classList.add('expanded-dot');
  dot.setAttribute('aria-label', `Collapse ${dec}s details`);
}

function collapseDetail() {
  if (!expandedDec) return;
  const station = stEl[expandedDec];
  const panel = station.querySelector('.detail-panel');
  const dot = station.querySelector('.timeline-dot');
  const dec = expandedDec;

  station.style.marginLeft = '0';
  panel.classList.remove('visible');
  dot.classList.remove('expanded-dot');
  dot.setAttribute('aria-label', `Expand ${dec}s details`);

  expandedDec = null;
  appMode = 'timeline';
}

/* ── 11. MODE 2 — SUBJECT FREQUENCY ─────────────────────── */

function enterSubjectMode(subject) {
  selSubject = subject;
  if (expandedDec) collapseDetail();   // close any open panel first
  // NOTE: appMode is set AFTER collapseDetail(), which resets it to 'timeline'.
  // Setting it here ensures it is not overwritten.
  appMode = 'subject';

  /* Show UI chrome */
  document.getElementById('back-btn').classList.add('visible');
  const tb = document.getElementById('subject-title-bar');
  tb.textContent = capitalize(subject);
  tb.classList.add('visible');
  document.body.classList.add('mode-subject');

  /* Compress station widths */
  DECADES.forEach(dec => { stEl[dec].style.width = STATION_C + 'px'; });

  /* Frequency data */
  const freqs = DECADES.map(d => rawData[d]?.[subject] ?? 0);
  const maxFreq = Math.max(...freqs, 1);

  /* After layout transition settles, show indicators + draw curve */
  setTimeout(() => {
    DECADES.forEach((dec, i) => {
      const freq = freqs[i];
      const barH = (freq / maxFreq) * FREQ_H_MAX;

      const ind = stEl[dec].querySelector('.freq-indicator');
      const bar = stEl[dec].querySelector('.freq-bar');
      const lbl = stEl[dec].querySelector('.freq-label');

      bar.style.height = barH + 'px';

      if (freq > 0) {
        lbl.innerHTML =
          `<div class="freq-number">${freq}</div>` +
          `<div class="freq-subject">${capitalize(subject)}</div>`;
      } else {
        lbl.innerHTML = `<div class="freq-number">0</div>`;
      }

      ind.classList.add('visible');
    });

    drawFreqCurve(freqs, maxFreq);
  }, TRANS_MS);
}

function exitSubjectMode() {
  if (appMode !== 'subject') return;

  document.getElementById('back-btn').classList.remove('visible');
  const tb = document.getElementById('subject-title-bar');
  tb.classList.remove('visible');
  document.body.classList.remove('mode-subject');

  /* Hide indicators and restore widths */
  DECADES.forEach(dec => {
    const ind = stEl[dec].querySelector('.freq-indicator');
    const bar = stEl[dec].querySelector('.freq-bar');
    ind.classList.remove('visible');
    setTimeout(() => { bar.style.height = '0'; }, 60);
    stEl[dec].style.width = STATION_W + 'px';
  });

  /* Hide curve */
  const svg = document.getElementById('freq-curve-svg');
  svg.classList.remove('visible');
  setTimeout(() => { svg.innerHTML = ''; }, 520);

  selSubject = null;
  appMode = 'timeline';
}

document.getElementById('back-btn').addEventListener('click', exitSubjectMode);

/* ── 12. FREQUENCY CURVE SVG ─────────────────────────────── */

/**
 * Computes dot center Y position from top of track.
 * Must match CSS: --cloud-h = innerHeight - 230; dot center = cloud-h + dot-area-h/2
 */
function dotCenterY() {
  return (window.innerHeight - 230) + DOT_AREA_H / 2;
}

function drawFreqCurve(freqs, maxFreq) {
  const svg = document.getElementById('freq-curve-svg');
  const track = document.getElementById('timeline-track');

  /* Size SVG to match full track */
  const trackW = track.scrollWidth;
  const trackH = window.innerHeight;
  svg.setAttribute('viewBox', `0 0 ${trackW} ${trackH}`);
  svg.style.width = trackW + 'px';
  svg.style.height = trackH + 'px';

  const dotY = dotCenterY();

  /* Compute tip point per decade */
  const pts = DECADES.map((dec, i) => {
    const station = stEl[dec];
    // offsetLeft is relative to track's left border edge
    const x = station.offsetLeft + STATION_C / 2;
    const barH = (freqs[i] / maxFreq) * FREQ_H_MAX;
    const y = dotY - barH;   // rise above dot center
    return { x, y, freq: freqs[i] };
  });

  /* Smooth cubic-bezier path (horizontal control points) */
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const cpx = ((a.x + b.x) / 2).toFixed(1);
    d += ` C ${cpx} ${a.y.toFixed(1)}, ${cpx} ${b.y.toFixed(1)}, ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }

  svg.innerHTML = '';
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('stroke', '#1A1A1A');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);

  svg.classList.add('visible');
}

/* ── 13. WINDOW RESIZE ───────────────────────────────────── */

let _resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    // Re-layout and redraw all clouds
    DECADES.forEach(dec => initialDraw(dec));
    // Reposition timeline line (CSS handles this via calc)
  }, 250);
});

/* ── 14. INIT ────────────────────────────────────────────── */

async function init() {
  try {
    /* Load from parent directory (DH/topics_per_decade.json) */
    const res = await fetch('./topics_per_decade.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rawData = await res.json();
    buildTimeline();
  } catch (err) {
    console.error('Could not load topics_per_decade.json:', err);
    document.body.innerHTML =
      `<p style="padding:60px;font-family:Inter,sans-serif;color:#c00;font-size:15px;">
        ⚠️ Could not load <code>topics_per_decade.json</code>.<br><br>
        Make sure you are serving these files from a local HTTP server<br>
        (e.g. <code>python -m http.server</code> in the <strong>DH/</strong> folder).
      </p>`;
  }
}

init();
