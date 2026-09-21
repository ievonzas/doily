/* Doily v1 — a cosy health diary. Everything lives on this device. */
(() => {
  'use strict';

  // ---------- constants ----------
  const ENTRIES_KEY = 'doily.entries.v1';
  const SETTINGS_KEY = 'doily.settings.v1';
  const WEATHER_CACHE_KEY = 'doily.weather.v1';
  const RECORDS_KEY = 'doily.records.v1';
  const MIN_PATTERN_DAYS = 14;

  const DEFAULT_SYMPTOMS = ['Headache', 'Migraine', 'Fatigue', 'Nausea', 'Bloating', 'Cramps', 'Rash', 'Itching',
    'Dizziness', 'Low mood', 'Anxious', 'Irritable', 'Brain fog', 'Acne', 'Sore breasts', 'Constipation',
    'Diarrhoea', 'Hot flush', 'Swelling', 'Poor sleep'];
  const PAIN_AREAS = ['Head', 'Neck', 'Shoulders', 'Back', 'Belly', 'Pelvis', 'Joints', 'Legs', 'Chest', 'Other'];
  const FLOWS = [['none', 'None'], ['spotting', 'Spotting'], ['light', 'Light'], ['medium', 'Medium'], ['heavy', 'Heavy']];
  const MOON_EMOJI = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
  const MOON_NAMES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  const WEATHER_CODES = {
    0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
    45: ['🌫️', 'Fog'], 48: ['🌫️', 'Rime fog'], 51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Heavy drizzle'],
    56: ['🌧️', 'Freezing drizzle'], 57: ['🌧️', 'Freezing drizzle'], 61: ['🌧️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
    66: ['🌧️', 'Freezing rain'], 67: ['🌧️', 'Freezing rain'], 71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'],
    77: ['🌨️', 'Snow grains'], 80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Heavy showers'],
    85: ['🌨️', 'Snow showers'], 86: ['❄️', 'Snow showers'], 95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunder + hail'], 99: ['⛈️', 'Thunder + hail']
  };

  // ---------- state ----------
  let entries = load(ENTRIES_KEY, {});
  let settings = Object.assign({
    lat: null, lon: null, place: '', cycleLength: 28, periodLength: 5,
    customSymptoms: [], customPainAreas: [], docLang: 'lt'
  }, load(SETTINGS_KEY, {}));
  let currentDate = todayKey();
  let tab = 'log';
  let calMonth = firstOfMonth(new Date());
  let weather = load(WEATHER_CACHE_KEY, null);
  const openCards = new Set(); // log cards the user has unfolded this session
  let records = load(RECORDS_KEY, []); // tests, courses and notes, see records section
  let recType = 'test';

  // ---------- helpers ----------
  function load(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Could not save: storage is full or blocked'); } }
  function saveEntries() {
    for (const k in entries) if (!hasContent(entries[k]) && !entries[k].weather) delete entries[k];
    save(ENTRIES_KEY, entries);
  }
  function saveSettings() { save(SETTINGS_KEY, settings); }
  function saveRecords() { records.sort((a, b) => (b.date || b.start).localeCompare(a.date || a.start)); save(RECORDS_KEY, records); }

  function pad(n) { return String(n).padStart(2, '0'); }
  function keyOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function todayKey() { return keyOf(new Date()); }
  function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(k, n) { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); }
  function diffDays(a, b) { return Math.round((parseKey(b) - parseKey(a)) / 86400000); }
  function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function fmtDate(k) {
    const d = parseKey(k);
    const t = todayKey();
    if (k === t) return 'Today';
    if (k === addDays(t, -1)) return 'Yesterday';
    if (k === addDays(t, 1)) return 'Tomorrow';
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function fmtLong(k) { return parseKey(k).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function entry(k) {
    if (!entries[k]) entries[k] = { pains: [], symptoms: [], foods: [], meds: [], flow: 'none', sleep: null, notes: '' };
    return entries[k];
  }
  function hasContent(e) {
    return e && (e.pains.length || e.symptoms.length || e.foods.length || e.meds.length || (e.flow && e.flow !== 'none') || e.sleep != null || (e.notes && e.notes.trim()));
  }

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- moon ----------
  function moonFraction(date) {
    // Meeus, Astronomical Algorithms ch. 48 (low precision): true phase, not just the mean cycle
    const rad = x => x * Math.PI / 180;
    const jd = date.getTime() / 86400000 + 2440587.5;
    const T = (jd - 2451545.0) / 36525;
    const D = 297.8501921 + 445267.1114034 * T;   // mean elongation of the moon
    const M = 357.5291092 + 35999.0502909 * T;    // sun mean anomaly
    const Mp = 134.9633964 + 477198.8675055 * T;  // moon mean anomaly
    const e = D + 6.289 * Math.sin(rad(Mp)) - 2.100 * Math.sin(rad(M)) + 1.274 * Math.sin(rad(2 * D - Mp))
      + 0.658 * Math.sin(rad(2 * D)) + 0.214 * Math.sin(rad(2 * Mp)) + 0.110 * Math.sin(rad(D));
    return (((e % 360) + 360) % 360) / 360; // 0 = new, 0.5 = full
  }
  function moonInfo(k) {
    const d = parseKey(k); d.setHours(12);
    const synodic = 29.530588853;
    const frac = moonFraction(d);
    const illum = Math.round((1 - Math.cos(2 * Math.PI * frac)) / 2 * 100);
    const idx = Math.floor(((frac + 0.0625) % 1) * 8);
    const toFull = frac < 0.5 ? (0.5 - frac) * synodic : (1.5 - frac) * synodic;
    const toNew = (1 - frac) * synodic;
    return { emoji: MOON_EMOJI[idx], name: MOON_NAMES[idx], illum, age: Math.round(frac * synodic), daysToFull: Math.round(toFull), daysToNew: Math.round(toNew) };
  }

  // ---------- cycle ----------
  function flowDays() {
    return Object.keys(entries).filter(k => entries[k].flow && entries[k].flow !== 'none').sort();
  }
  function periodStarts() {
    const days = flowDays().filter(k => entries[k].flow !== 'spotting');
    const starts = []; let prev = null;
    for (const k of days) {
      if (!prev || diffDays(prev, k) >= 5) starts.push(k);
      prev = k;
    }
    return starts;
  }
  function cycleStats() {
    const starts = periodStarts();
    const lens = [];
    for (let i = 1; i < starts.length; i++) {
      const l = diffDays(starts[i - 1], starts[i]);
      if (l >= 15 && l <= 60) lens.push(l);
    }
    const recent = lens.slice(-6);
    const cycleLength = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : settings.cycleLength;
    const plens = starts.map(s => { let n = 0; let k = s; while (entries[k] && entries[k].flow && entries[k].flow !== 'none') { n++; k = addDays(k, 1); } return k >= todayKey() ? 0 : n; }).filter(n => n > 0 && n <= 10); // a period still going today is not counted yet
    const periodLength = plens.length ? Math.round(plens.slice(-6).reduce((a, b) => a + b, 0) / plens.slice(-6).length) : settings.periodLength;
    const lastStart = starts[starts.length - 1] || null;
    return { starts, cycleLength, periodLength, lastStart, sampled: recent.length };
  }
  function cycleForDate(k) {
    const cs = cycleStats();
    if (!cs.lastStart) return { ...cs, day: null, nextStart: null, ovulation: null, predicted: [] };
    let start = cs.lastStart;
    const starts = cs.starts;
    for (const s of starts) if (s <= k) start = s;
    const day = diffDays(start, k) + 1;
    let nextStart = addDays(cs.lastStart, cs.cycleLength);
    // if a predicted period is more than two weeks late and nothing was logged, assume it was missed and look to the next one
    while (nextStart < addDays(todayKey(), -14)) nextStart = addDays(nextStart, cs.cycleLength);
    const predicted = [];
    for (let i = 0; i < 4; i++) predicted.push(addDays(nextStart, i * cs.cycleLength));
    const ovulation = addDays(nextStart, -14);
    return { ...cs, day: day > 0 ? day : null, nextStart, ovulation, predicted };
  }
  function dayCycleClass(k, cyc) {
    const e = entries[k];
    if (e && e.flow && e.flow !== 'none') return 'flow-' + e.flow;
    if (!cyc.nextStart) return '';
    for (const p of cyc.predicted) {
      const dd = diffDays(p, k);
      if (dd >= 0 && dd < cyc.periodLength) return 'predicted';
      const ov = addDays(p, -14);
      const od = diffDays(ov, k);
      if (od === 0) return 'ovulation';
      if (od >= -5 && od <= 1) return 'fertile';
    }
    return '';
  }

  // ---------- weather ----------
  async function fetchWeather(force) {
    if (settings.lat == null || settings.lon == null) return;
    if (!force && weather && weather.fetchedAt && Date.now() - weather.fetchedAt < 30 * 60 * 1000 && weather.lat === settings.lat) return;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${settings.lat}&longitude=${settings.lon}` +
      `&hourly=surface_pressure,pressure_msl,temperature_2m,relative_humidity_2m,weather_code&past_days=2&forecast_days=2&timezone=auto`;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const h = j.hourly;
      const now = new Date();
      const nowKey = `${keyOf(now)}T${pad(now.getHours())}:00`;
      let i = h.time.indexOf(nowKey);
      if (i < 0) i = h.time.findIndex(t => t > nowKey) - 1;
      if (i < 0) i = 0;
      const p = h.pressure_msl[i], p24 = h.pressure_msl[Math.max(0, i - 24)], p12f = h.pressure_msl[Math.min(h.time.length - 1, i + 12)];
      const p6 = h.pressure_msl[Math.max(0, i - 6)];
      weather = {
        fetchedAt: Date.now(), lat: settings.lat, lon: settings.lon,
        pressure: Math.round(p), change24: Math.round((p - p24) * 10) / 10, change6: Math.round((p - p6) * 10) / 10,
        trend12: Math.round((p12f - p) * 10) / 10,
        temp: Math.round(h.temperature_2m[i]), humidity: h.relative_humidity_2m[i], code: h.weather_code[i],
        daily: {}
      };
      // per-day summaries so history keeps a pressure snapshot
      const byDay = {};
      h.time.forEach((t, idx) => { const k = t.slice(0, 10); (byDay[k] = byDay[k] || []).push(idx); });
      for (const k in byDay) {
        const ps = byDay[k].map(idx => h.pressure_msl[idx]);
        const ts = byDay[k].map(idx => h.temperature_2m[idx]);
        weather.daily[k] = {
          pMin: Math.round(Math.min(...ps)), pMax: Math.round(Math.max(...ps)),
          pMean: Math.round(ps.reduce((a, b) => a + b, 0) / ps.length),
          pSwing: Math.round((Math.max(...ps) - Math.min(...ps)) * 10) / 10,
          tMin: Math.round(Math.min(...ts)), tMax: Math.round(Math.max(...ts))
        };
      }
      save(WEATHER_CACHE_KEY, weather);
      // stamp snapshots onto entries for today and past days (never overwrite older snapshot with forecast)
      const t = todayKey();
      for (const k in weather.daily) {
        if (k > t) continue;
        const e = entry(k);
        if (!e.weather || k === t) e.weather = { ...weather.daily[k], code: k === t ? weather.code : (e.weather && e.weather.code) };
      }
      saveEntries();
    } catch (err) {
      console.warn('weather', err);
      toast('Could not fetch weather right now');
    }
  }

  // ---------- records: test results, medicine/supplement courses, notes ----------
  // { id, type:'test', name, date, value, unit, low, high, notes }
  // { id, type:'course', name, start, end|null, notes }   end null = still taking
  // { id, type:'note', name, date, notes }
  function courseActive(r, k) { return r.type === 'course' && r.start <= k && (!r.end || k <= r.end); }
  function fmtShort(k) { return parseKey(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }

  // ---------- patterns: rule-based, offline, her own logs only ----------
  function loggedDays() { return Object.keys(entries).filter(k => hasContent(entries[k])).sort(); }
  function daySymptoms(e) {
    const s = new Set(e.symptoms);
    for (const p of e.pains) if (p.level >= 4) s.add(p.area + ' pain');
    return s;
  }
  const FACTOR_LABELS = {
    pdrop: 'when pressure fell 4 hPa or more since the day before',
    prise: 'when pressure rose 4 hPa or more since the day before',
    pswing: 'on days the pressure swung 8 hPa or more',
    plow: 'on low-pressure days (1000 hPa or under)',
    shortsleep: 'after a night of under 6 hours',
    fullmoon: 'around the full moon',
    newmoon: 'around the new moon',
    menses: 'on period days',
    premens: 'in the 5 days before a period',
    ovul: 'around ovulation'
  };
  function factorLabel(f) {
    if (FACTOR_LABELS[f]) return FACTOR_LABELS[f];
    const [kind, v] = [f.slice(0, f.indexOf(':')), f.slice(f.indexOf(':') + 1)];
    if (kind === 'food') return `within a day of having ${v}`;
    if (kind === 'med') return `within a day of taking ${v}`;
    if (kind === 'course') { const r = records.find(x => x.id === v); return `while on ${r ? r.name : 'a course'}`; }
    return f;
  }
  function dayFactors(k) {
    const e = entries[k], y = entries[addDays(k, -1)];
    const f = new Set();
    if (e.weather) {
      if (y && y.weather) { const d = e.weather.pMean - y.weather.pMean; if (d <= -4) f.add('pdrop'); if (d >= 4) f.add('prise'); }
      if (e.weather.pSwing >= 8) f.add('pswing');
      if (e.weather.pMean <= 1000) f.add('plow');
    }
    if (y && y.sleep != null && y.sleep < 6) f.add('shortsleep');
    const m = moonInfo(k);
    if (m.illum >= 97) f.add('fullmoon'); else if (m.illum <= 3) f.add('newmoon');
    const cyc = cycleForDate(k);
    if (e.flow && e.flow !== 'none' && e.flow !== 'spotting') f.add('menses');
    else if (cyc.nextStart) {
      const to = diffDays(k, cyc.nextStart);
      if (to >= 1 && to <= 5) f.add('premens');
      if (Math.abs(diffDays(k, cyc.ovulation)) <= 1) f.add('ovul');
    }
    for (const x of e.foods) f.add('food:' + x);
    for (const x of e.meds) f.add('med:' + x);
    if (y) { for (const x of y.foods) f.add('food:' + x); for (const x of y.meds) f.add('med:' + x); }
    for (const r of records) if (courseActive(r, k)) f.add('course:' + r.id);
    return f;
  }
  // Returns { days, findings: [{ symptom, factor, label, hitsW, nW, hitsO, nO, more }] }
  function patternReport() {
    const days = loggedDays();
    const out = { days: days.length, findings: [] };
    if (days.length < MIN_PATTERN_DAYS) return out;
    const symCount = {}, facDays = {};
    const perDay = days.map(k => { const sy = daySymptoms(entries[k]); const fa = dayFactors(k); for (const s of sy) symCount[s] = (symCount[s] || 0) + 1; for (const f of fa) facDays[f] = (facDays[f] || 0) + 1; return { sy, fa }; });
    const N = days.length;
    for (const sym in symCount) {
      if (symCount[sym] < 3) continue;
      const cand = [];
      for (const fac in facDays) {
        const nW = facDays[fac], nO = N - nW;
        if (nW < 3 || nO < 3) continue;
        let hitsW = 0;
        for (const d of perDay) if (d.fa.has(fac) && d.sy.has(sym)) hitsW++;
        const hitsO = symCount[sym] - hitsW;
        const rW = hitsW / nW, rO = hitsO / nO;
        const more = rW >= rO + 0.2 && rW >= rO * 1.5 && hitsW >= 3;
        const less = rO >= rW + 0.2 && rW <= rO * 0.5 && hitsO >= 3;
        if (!more && !less) continue;
        cand.push({ symptom: sym, factor: fac, label: factorLabel(fac), hitsW, nW, hitsO, nO, more, score: Math.abs(rW - rO) * Math.sqrt(Math.min(nW, nO)) });
      }
      cand.sort((a, b) => b.score - a.score);
      out.findings.push(...cand.slice(0, 4));
    }
    return out;
  }
  // symptom frequency inside a set of day keys vs all other logged days
  function compareWindow(inside) {
    const days = loggedDays();
    const inSet = new Set(inside.filter(k => entries[k] && hasContent(entries[k])));
    const nW = inSet.size, nO = days.length - nW;
    const res = [];
    if (nW < 5 || nO < 5) return { nW, nO, res };
    const cW = {}, cO = {};
    for (const k of days) for (const s of daySymptoms(entries[k])) { if (inSet.has(k)) cW[s] = (cW[s] || 0) + 1; else cO[s] = (cO[s] || 0) + 1; }
    for (const s of new Set([...Object.keys(cW), ...Object.keys(cO)])) {
      const hW = cW[s] || 0, hO = cO[s] || 0;
      if (hW + hO < 3) continue;
      const rW = hW / nW, rO = hO / nO;
      if (Math.abs(rW - rO) < 0.2) continue;
      res.push({ symptom: s, hitsW: hW, hitsO: hO, more: rW > rO, diff: Math.abs(rW - rO) });
    }
    res.sort((a, b) => b.diff - a.diff);
    return { nW, nO, res: res.slice(0, 3) };
  }
  function recordFindings() {
    const out = [];
    for (const r of records) {
      if (r.type === 'test') {
        const lines = [];
        const v = Number(r.value);
        if (r.value !== '' && r.value != null && !isNaN(v)) {
          if (r.low != null && r.low !== '' && v < Number(r.low)) lines.push({ flag: 'low', text: `${r.value} ${r.unit || ''} is below the range printed on the result (${r.low}–${r.high ?? '…'}). Worth mentioning to a doctor if you have not already.` });
          else if (r.high != null && r.high !== '' && v > Number(r.high)) lines.push({ flag: 'high', text: `${r.value} ${r.unit || ''} is above the range printed on the result (${r.low ?? '…'}–${r.high}). Worth mentioning to a doctor if you have not already.` });
          else if ((r.low != null && r.low !== '') || (r.high != null && r.high !== '')) lines.push({ flag: 'ok', text: `${r.value} ${r.unit || ''}, within the range printed on the result.` });
          else lines.push({ flag: 'ok', text: `${r.value} ${r.unit || ''}.` });
        }
        const win = []; for (let i = 0; i < 30; i++) win.push(addDays(r.date, -i));
        const c = compareWindow(win);
        for (const x of c.res) lines.push({ flag: x.more ? 'more' : 'less', text: `In the month before this test, ${x.symptom} was logged on ${x.hitsW} of ${c.nW} days, compared with ${x.hitsO} of ${c.nO} other days.` });
        if (c.nW < 5) lines.push({ flag: 'info', text: `Fewer than 5 days logged in the month before this test, so no symptom comparison yet.` });
        out.push({ record: r, lines });
      } else if (r.type === 'course') {
        const lines = [];
        const end = r.end || todayKey();
        const inside = []; for (let k = r.start; k <= end; k = addDays(k, 1)) inside.push(k);
        const before = []; for (let i = 1; i <= 60; i++) before.push(addDays(r.start, -i));
        const beforeLogged = before.filter(k => entries[k] && hasContent(entries[k]));
        const insideLogged = inside.filter(k => entries[k] && hasContent(entries[k]));
        if (beforeLogged.length >= 5 && insideLogged.length >= 5) {
          const cW = {}, cB = {};
          for (const k of insideLogged) for (const s of daySymptoms(entries[k])) cW[s] = (cW[s] || 0) + 1;
          for (const k of beforeLogged) for (const s of daySymptoms(entries[k])) cB[s] = (cB[s] || 0) + 1;
          const res = [];
          for (const s of new Set([...Object.keys(cW), ...Object.keys(cB)])) {
            const hW = cW[s] || 0, hB = cB[s] || 0; if (hW + hB < 3) continue;
            const d = hW / insideLogged.length - hB / beforeLogged.length;
            if (Math.abs(d) >= 0.2) res.push({ s, hW, hB, d });
          }
          res.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
          for (const x of res.slice(0, 3)) lines.push({ flag: x.d < 0 ? 'less' : 'more', text: `${x.s}: ${x.hW} of ${insideLogged.length} days ${r.end ? 'while on it' : 'since starting'}, compared with ${x.hB} of ${beforeLogged.length} logged days in the two months before.` });
          if (!res.length) lines.push({ flag: 'info', text: `No clear change in what you logged before and ${r.end ? 'during' : 'since starting'} this.` });
        } else lines.push({ flag: 'info', text: `Needs at least 5 logged days before the start and 5 during to compare (have ${beforeLogged.length} and ${insideLogged.length}).` });
        out.push({ record: r, lines });
      }
    }
    return out;
  }

  // ---------- doctor summary: plain text in her chosen language ----------
  // Only fixed vocabulary is translated (default symptoms, pain areas, flow, factor labels, headings).
  // Anything she typed herself (custom symptoms, foods, meds, records) is kept exactly as typed.
  const LANGS = [['lt', 'Lietuvių'], ['en', 'English'], ['ru', 'Русский']];
  const I18N = {
    en: {
      title: 'Health diary summary (Doily)',
      generated: 'Generated {date}. Covers {from} to {to}, {n} logged days. Self-reported by the patient in a diary app.',
      cycle: 'Menstrual cycle', cycleLine: 'Last period start dates: {dates}. Average cycle length {cl} days (from {k} cycles), period length {pl} days.', noCycle: 'No periods logged.',
      symptoms: 'Symptoms, last 90 days', symLine: '{sym}: {hits} of {n} logged days ({pct}%)', painLine: 'Pain, {area}: {hits} days, average intensity {avg}/10', none: 'none logged',
      meds: 'Medicines and supplements logged, last 90 days', medLine: '{name}: {n} days',
      courses: 'Courses (medicines or supplements taken over a period)', courseLine: '{name}: from {start} to {end}', courseOngoing: '{name}: since {start}, still taking',
      tests: 'Test results (typed in by the patient from the result sheet)', testLine: '{date}: {name} {value} {unit}', range: 'reference range {low}–{high}', below: 'BELOW RANGE', above: 'ABOVE RANGE',
      notes: 'Notes', patterns: 'Patterns in the diary (correlations, not causes)',
      more: '{sym}: more often {label}. On {hitsW} of {nW} days, compared with {hitsO} of {nO} other days.',
      less: '{sym}: less often {label}. On {hitsW} of {nW} days, compared with {hitsO} of {nO} other days.',
      noPatterns: 'Not enough days logged yet for patterns.',
      footer: 'Generated by Doily, a personal diary app. These are correlations in self-reported logs, not a diagnosis.',
      flows: { none: 'none', spotting: 'spotting', light: 'light', medium: 'medium', heavy: 'heavy' },
      factors: { pdrop: 'when air pressure fell 4 hPa or more since the day before', prise: 'when air pressure rose 4 hPa or more since the day before', pswing: 'on days the pressure swung 8 hPa or more', plow: 'on low-pressure days (1000 hPa or under)', shortsleep: 'after a night of under 6 hours of sleep', fullmoon: 'around the full moon', newmoon: 'around the new moon', menses: 'on period days', premens: 'in the 5 days before a period', ovul: 'around ovulation', food: 'within a day of having: {x}', med: 'within a day of taking: {x}', course: 'while on the course: {x}' },
      sym: {}, area: {}, painName: 'Pain: {area}'
    },
    lt: {
      title: 'Sveikatos dienoraščio santrauka (Doily)',
      generated: 'Sudaryta {date}. Apima laikotarpį nuo {from} iki {to}, {n} užpildytų dienų. Pacientės savarankiškai vesti įrašai dienoraščio programėlėje.',
      cycle: 'Menstruacinis ciklas', cycleLine: 'Paskutinių mėnesinių pradžios datos: {dates}. Vidutinė ciklo trukmė {cl} d. (pagal {k} ciklus), mėnesinių trukmė {pl} d.', noCycle: 'Mėnesinės neužfiksuotos.',
      symptoms: 'Simptomai per paskutines 90 dienų', symLine: '{sym}: {hits} iš {n} užpildytų dienų ({pct} %)', painLine: 'Skausmas, {area}: {hits} d., vidutinis stiprumas {avg}/10', none: 'neužfiksuota',
      meds: 'Vartoti vaistai ir papildai per paskutines 90 dienų', medLine: '{name}: {n} d.',
      courses: 'Kursai (vaistai ar papildai, vartoti tam tikrą laikotarpį)', courseLine: '{name}: nuo {start} iki {end}', courseOngoing: '{name}: nuo {start}, tebevartoja',
      tests: 'Tyrimų rezultatai (pacientės įvesti iš atsakymo lapo)', testLine: '{date}: {name} {value} {unit}', range: 'referencinės ribos {low}–{high}', below: 'ŽEMIAU RIBOS', above: 'AUKŠČIAU RIBOS',
      notes: 'Pastabos', patterns: 'Dėsningumai dienoraštyje (sąsajos, ne priežastys)',
      more: '{sym}: dažniau {label}. {hitsW} iš {nW} dienų, palyginti su {hitsO} iš {nO} kitų dienų.',
      less: '{sym}: rečiau {label}. {hitsW} iš {nW} dienų, palyginti su {hitsO} iš {nO} kitų dienų.',
      noPatterns: 'Dėsningumams dar per mažai užpildytų dienų.',
      footer: 'Sudaryta programėle „Doily“ (asmeninis dienoraštis). Tai tik sąsajos pačios pacientės įrašuose, ne diagnozė.',
      flows: { none: 'nėra', spotting: 'tepimas', light: 'negausios', medium: 'vidutinės', heavy: 'gausios' },
      factors: { pdrop: 'kai oro slėgis nukrito 4 hPa ar daugiau nuo praėjusios dienos', prise: 'kai oro slėgis pakilo 4 hPa ar daugiau nuo praėjusios dienos', pswing: 'dienomis, kai slėgis svyravo 8 hPa ar daugiau', plow: 'žemo slėgio dienomis (1000 hPa ar mažiau)', shortsleep: 'po trumpesnio nei 6 val. miego', fullmoon: 'apie pilnatį', newmoon: 'apie jaunatį', menses: 'mėnesinių dienomis', premens: '5 dienas prieš mėnesines', ovul: 'apie ovuliaciją', food: 'per parą po to, kai vartojo: {x}', med: 'per parą po to, kai vartojo: {x}', course: 'vartojant kursą: {x}' },
      sym: { 'Headache': 'Galvos skausmas', 'Migraine': 'Migrena', 'Fatigue': 'Nuovargis', 'Nausea': 'Pykinimas', 'Bloating': 'Pilvo pūtimas', 'Cramps': 'Spazmai', 'Rash': 'Bėrimas', 'Itching': 'Niežėjimas', 'Dizziness': 'Galvos svaigimas', 'Low mood': 'Prasta nuotaika', 'Anxious': 'Nerimas', 'Irritable': 'Dirglumas', 'Brain fog': 'Sunku susikaupti', 'Acne': 'Spuogai', 'Sore breasts': 'Skausmingos krūtys', 'Constipation': 'Vidurių užkietėjimas', 'Diarrhoea': 'Viduriavimas', 'Hot flush': 'Karščio pylimas', 'Swelling': 'Tinimas', 'Poor sleep': 'Prastas miegas' },
      area: { 'Head': 'galva', 'Neck': 'kaklas', 'Shoulders': 'pečiai', 'Back': 'nugara', 'Belly': 'pilvas', 'Pelvis': 'dubuo', 'Joints': 'sąnariai', 'Legs': 'kojos', 'Chest': 'krūtinė', 'Other': 'kita' },
      painName: 'Skausmas: {area}'
    },
    ru: {
      title: 'Сводка дневника здоровья (Doily)',
      generated: 'Составлено {date}. Охватывает период с {from} по {to}, {n} заполненных дней. Записи вела сама пациентка в приложении-дневнике.',
      cycle: 'Менструальный цикл', cycleLine: 'Даты начала последних менструаций: {dates}. Средняя длина цикла {cl} дн. (по {k} циклам), длительность менструации {pl} дн.', noCycle: 'Менструации не отмечены.',
      symptoms: 'Симптомы за последние 90 дней', symLine: '{sym}: {hits} из {n} заполненных дней ({pct} %)', painLine: 'Боль, {area}: {hits} дн., средняя интенсивность {avg}/10', none: 'не отмечено',
      meds: 'Принимаемые лекарства и добавки за последние 90 дней', medLine: '{name}: {n} дн.',
      courses: 'Курсы (лекарства или добавки, принимаемые в течение периода)', courseLine: '{name}: с {start} по {end}', courseOngoing: '{name}: с {start}, продолжает принимать',
      tests: 'Результаты анализов (введены пациенткой с бланка результата)', testLine: '{date}: {name} {value} {unit}', range: 'референсный диапазон {low}–{high}', below: 'НИЖЕ НОРМЫ', above: 'ВЫШЕ НОРМЫ',
      notes: 'Заметки', patterns: 'Закономерности в дневнике (корреляции, не причины)',
      more: '{sym}: чаще {label}. В {hitsW} из {nW} дней, по сравнению с {hitsO} из {nO} остальных дней.',
      less: '{sym}: реже {label}. В {hitsW} из {nW} дней, по сравнению с {hitsO} из {nO} остальных дней.',
      noPatterns: 'Пока недостаточно заполненных дней для закономерностей.',
      footer: 'Составлено приложением Doily (личный дневник). Это только корреляции в записях самой пациентки, не диагноз.',
      flows: { none: 'нет', spotting: 'мажущие', light: 'скудные', medium: 'умеренные', heavy: 'обильные' },
      factors: { pdrop: 'когда атмосферное давление упало на 4 гПа или больше по сравнению с предыдущим днём', prise: 'когда атмосферное давление выросло на 4 гПа или больше по сравнению с предыдущим днём', pswing: 'в дни, когда давление колебалось на 8 гПа или больше', plow: 'в дни низкого давления (1000 гПа и ниже)', shortsleep: 'после ночи со сном меньше 6 часов', fullmoon: 'около полнолуния', newmoon: 'около новолуния', menses: 'в дни менструации', premens: 'за 5 дней до менструации', ovul: 'около овуляции', food: 'в течение суток после употребления: {x}', med: 'в течение суток после приёма: {x}', course: 'во время курса: {x}' },
      sym: { 'Headache': 'Головная боль', 'Migraine': 'Мигрень', 'Fatigue': 'Усталость', 'Nausea': 'Тошнота', 'Bloating': 'Вздутие живота', 'Cramps': 'Спазмы', 'Rash': 'Сыпь', 'Itching': 'Зуд', 'Dizziness': 'Головокружение', 'Low mood': 'Подавленное настроение', 'Anxious': 'Тревожность', 'Irritable': 'Раздражительность', 'Brain fog': 'Туман в голове', 'Acne': 'Акне', 'Sore breasts': 'Болезненность груди', 'Constipation': 'Запор', 'Diarrhoea': 'Диарея', 'Hot flush': 'Приливы жара', 'Swelling': 'Отёки', 'Poor sleep': 'Плохой сон' },
      area: { 'Head': 'голова', 'Neck': 'шея', 'Shoulders': 'плечи', 'Back': 'спина', 'Belly': 'живот', 'Pelvis': 'таз', 'Joints': 'суставы', 'Legs': 'ноги', 'Chest': 'грудь', 'Other': 'другое' },
      painName: 'Боль: {area}'
    }
  };
  function tpl(str, vars) { return str.replace(/\{(\w+)\}/g, (m, k) => vars[k] != null ? vars[k] : m); }
  function trSym(name, L) {
    if (name.endsWith(' pain')) { const a = name.slice(0, -5); return tpl(L.painName, { area: L.area[a] || a }); }
    return L.sym[name] || name;
  }
  function trArea(a, L) { return L.area[a] || a; }
  function trFactor(f, L) {
    if (L.factors[f]) return L.factors[f];
    const kind = f.slice(0, f.indexOf(':')), v = f.slice(f.indexOf(':') + 1);
    if (kind === 'course') { const r = records.find(x => x.id === v); return tpl(L.factors.course, { x: r ? r.name : '?' }); }
    return tpl(L.factors[kind] || '{x}', { x: v });
  }
  function buildDoctorSummary(lang) {
    const L = I18N[lang] || I18N.en;
    const days = loggedDays();
    const out = [L.title, ''];
    out.push(tpl(L.generated, { date: todayKey(), from: days[0] || '—', to: days[days.length - 1] || '—', n: days.length }), '');
    // cycle
    const cs = cycleStats();
    out.push('## ' + L.cycle);
    if (cs.starts.length) out.push(tpl(L.cycleLine, { dates: cs.starts.slice(-6).join(', '), cl: cs.cycleLength, k: cs.sampled, pl: cs.periodLength }));
    else out.push(L.noCycle);
    out.push('');
    // symptoms and pain over last 90 logged days
    const recent = days.slice(-90);
    const sc = {}, pc = {}, mc = {};
    for (const k of recent) {
      const e = entries[k];
      for (const x of e.symptoms) sc[x] = (sc[x] || 0) + 1;
      for (const p of e.pains) { const o = pc[p.area] = pc[p.area] || { n: 0, sum: 0 }; o.n++; o.sum += p.level; }
      for (const x of e.meds) mc[x] = (mc[x] || 0) + 1;
    }
    out.push('## ' + L.symptoms);
    const symLines = Object.entries(sc).sort((a, b) => b[1] - a[1]).map(([x, n]) => '- ' + tpl(L.symLine, { sym: trSym(x, L), hits: n, n: recent.length, pct: Math.round(n / recent.length * 100) }));
    const painLines = Object.entries(pc).sort((a, b) => b[1].n - a[1].n).map(([a, o]) => '- ' + tpl(L.painLine, { area: trArea(a, L), hits: o.n, avg: Math.round(o.sum / o.n * 10) / 10 }));
    out.push(...(symLines.length || painLines.length ? [...symLines, ...painLines] : [L.none]), '');
    out.push('## ' + L.meds);
    const medLines = Object.entries(mc).sort((a, b) => b[1] - a[1]).map(([x, n]) => '- ' + tpl(L.medLine, { name: x, n }));
    out.push(...(medLines.length ? medLines : [L.none]), '');
    // records
    const courses = records.filter(r => r.type === 'course'), tests = records.filter(r => r.type === 'test'), notes = records.filter(r => r.type === 'note');
    if (courses.length) { out.push('## ' + L.courses); for (const r of courses) out.push('- ' + tpl(r.end ? L.courseLine : L.courseOngoing, { name: r.name, start: r.start, end: r.end }) + (r.notes ? ` (${r.notes})` : '')); out.push(''); }
    if (tests.length) {
      out.push('## ' + L.tests);
      for (const r of tests) {
        let line = tpl(L.testLine, { date: r.date, name: r.name, value: r.value || '', unit: r.unit || '' }).replace(/\s+$/, '');
        if (r.low || r.high) line += ' (' + tpl(L.range, { low: r.low ?? '…', high: r.high ?? '…' }) + ')';
        const v = Number(r.value);
        if (r.value && !isNaN(v)) { if (r.low && v < Number(r.low)) line += ' — ' + L.below; else if (r.high && v > Number(r.high)) line += ' — ' + L.above; }
        if (r.notes) line += ` (${r.notes})`;
        out.push('- ' + line);
      }
      out.push('');
    }
    if (notes.length) { out.push('## ' + L.notes); for (const r of notes) out.push(`- ${r.date}: ${r.name}${r.notes ? '. ' + r.notes : ''}`); out.push(''); }
    // patterns
    out.push('## ' + L.patterns);
    const rep = patternReport();
    if (rep.days < MIN_PATTERN_DAYS) out.push(L.noPatterns);
    else if (!rep.findings.length) out.push('—');
    else for (const f of rep.findings) out.push('- ' + tpl(f.more ? L.more : L.less, { sym: trSym(f.symptom, L), label: trFactor(f.factor, L), hitsW: f.hitsW, nW: f.nW, hitsO: f.hitsO, nO: f.nO }));
    out.push('', L.footer);
    return out.join('\n');
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { }
    try {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch { return false; }
  }

  // ---------- notices: gentle "might be felt today" hints ----------
  // General tendencies people report, phrased softly. Never a prediction about her, never advice.
  function dayNotices(k, e, moon, cyc, isToday) {
    const out = [];
    const live = isToday && weather && weather.lat === settings.lat ? weather : null;
    const snap = e.weather;
    if (live) {
      if (live.change6 <= -3) out.push(['🌬️', `Pressure has dropped ${Math.abs(live.change6)} hPa in the last 6 hours. Fast drops are the days pressure-sensitive people notice most: headaches, aching joints, feeling wobbly or low on energy.`]);
      else if (live.change24 <= -4 || live.trend12 <= -3) out.push(['🌬️', `Pressure is falling${live.trend12 <= -3 ? ' and keeps falling into the evening' : ''}. Some people notice headaches, joint aches or a heavy, weak feeling on days like this.`]);
      else if (live.change24 >= 5) out.push(['🎈', `Pressure is climbing quickly. Usually an easier day, though a few people get headaches on the way up too.`]);
      if (live.pressure <= 995) out.push(['🔻', `Pressure is low today at ${live.pressure} hPa. Low days can feel sluggish and headachy for some.`]);
      if (live.temp >= 28) out.push(['🥵', `Hot day at ${live.temp}°. Heat headaches, tiredness and swollen hands or feet are common. Water helps.`]);
      if (live.humidity >= 85 && live.temp >= 15) out.push(['💧', `Very humid air. Some people feel their joints or sinuses more on muggy days.`]);
      if (live.code >= 95) out.push(['⛈️', `Thunderstorms around. Pressure jumps about during storms, which some people feel as a headache or restlessness.`]);
    } else if (snap && snap.pSwing >= 8) {
      out.push(['🌬️', `Pressure swung ${snap.pSwing} hPa that day. Big swings are when pressure-sensitive people tend to notice headaches or aches.`]);
    }
    if (moon.daysToFull === 0) out.push(['🌕', `Full moon tonight. Some people sleep lighter and feel more restless around the full moon.`]);
    else if (moon.name === 'New moon') out.push(['🌑', `New moon. Dark nights, and some people feel quieter or lower on energy for a day or two.`]);
    if (cyc.day) {
      const toNext = cyc.nextStart ? diffDays(k, cyc.nextStart) : null;
      if (toNext != null && toNext >= 0 && toNext <= 4) out.push(['🌸', `Period due ${toNext === 0 ? 'today' : 'in ' + toNext + ' day' + (toNext > 1 ? 's' : '')}. The days just before often bring cramps, bloating, low mood, sore breasts or cravings.`]);
      else if (e.flow && e.flow !== 'none' && cyc.day <= 2) out.push(['🌸', `Day ${cyc.day} of your period. Cramps, tiredness and wanting to curl up are very common in the first days.`]);
      else if (cyc.ovulation && Math.abs(diffDays(k, cyc.ovulation)) <= 1) out.push(['🌿', `Around estimated ovulation. Some notice a twinge on one side, more energy, or a dip in mood a day or two later.`]);
    }
    const y = entries[addDays(k, -1)];
    if (y && y.sleep != null && y.sleep < 6) out.push(['😴', `Short night: ${y.sleep} hours logged for last night. Headaches, brain fog and being easily irritated are common after little sleep.`]);
    const general = out.slice(0, 4);
    // her own logs: findings whose factor applies to this day
    if (hasContent(e) || isToday) {
      const rep = patternReport();
      if (rep.findings.length) {
        const fa = dayFactors(k);
        const own = rep.findings.filter(f => f.more && fa.has(f.factor)).sort((a, b) => b.score - a.score).slice(0, 2);
        for (const f of own) general.push(['📒', `In your own logs, ${f.symptom} came up on ${f.hitsW} of ${f.nW} days ${f.label}, and today is such a day.`]);
      }
    }
    return general;
  }

  // ---------- speech ----------
  function speechSupported() { return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window; }
  function listen(onText, btn) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = navigator.language || 'en';
    rec.interimResults = false;
    btn.classList.add('listening');
    rec.onresult = ev => onText(ev.results[0][0].transcript);
    rec.onerror = () => toast('Could not hear that, try again');
    rec.onend = () => btn.classList.remove('listening');
    rec.start();
  }

  // ---------- frequency lists (for quick chips) ----------
  function frequent(field, limit) {
    const count = {};
    const keys = Object.keys(entries).sort().slice(-120);
    for (const k of keys) for (const x of (entries[k][field] || [])) count[x] = (count[x] || 0) + 1;
    return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, limit).map(x => x[0]);
  }

  // ---------- render: shell ----------
  const view = document.getElementById('view');
  function render() {
    document.getElementById('dateLabel').textContent = fmtDate(currentDate);
    document.getElementById('datePicker').value = currentDate;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    view.innerHTML = '';
    ({ log: renderLog, calendar: renderCalendar, patterns: renderPatterns, history: renderHistory, settings: renderSettings })[tab]();
    view.appendChild(el(`<p class="disclaimer">Doily keeps notes, it does not give medical advice. Talk to a doctor about anything that worries you.</p>`));
    window.scrollTo(0, 0);
  }

  // ---------- render: log ----------
  function renderLog() {
    const k = currentDate;
    const e = entry(k);
    const moon = moonInfo(k);
    const cyc = cycleForDate(k);
    const isToday = k === todayKey();

    // context card
    let wxTile;
    const snap = e.weather;
    if (isToday && weather && weather.lat === settings.lat) {
      const wc = WEATHER_CODES[weather.code] || ['🌡️', ''];
      const arrow = weather.change24 <= -4 ? '▼' : weather.change24 >= 4 ? '▲' : '→';
      const next = weather.trend12 <= -3 ? 'falling next 12h' : weather.trend12 >= 3 ? 'rising next 12h' : 'steady next 12h';
      wxTile = `<div class="tile"><div class="big">${wc[0]}</div><div class="val">${weather.pressure} hPa</div>
        <div class="sub">${arrow} ${weather.change24 > 0 ? '+' : ''}${weather.change24} hPa / 24h</div><div class="sub">${next}</div><div class="sub">${weather.temp}° · ${weather.humidity}% rh</div></div>`;
    } else if (snap) {
      const wc = WEATHER_CODES[snap.code] || ['🌡️', ''];
      wxTile = `<div class="tile"><div class="big">${wc[0]}</div><div class="val">${snap.pMean} hPa</div>
        <div class="sub">${snap.pMin}–${snap.pMax} hPa</div><div class="sub">swing ${snap.pSwing} hPa</div><div class="sub">${snap.tMin}–${snap.tMax}°</div></div>`;
    } else if (settings.lat == null) {
      wxTile = `<div class="tile link" data-go="settings"><div class="big">📍</div><div class="val">Set location</div><div class="sub">for pressure</div></div>`;
    } else {
      wxTile = `<div class="tile"><div class="big">🌡️</div><div class="val">No data</div><div class="sub">for this day</div></div>`;
    }
    let cycTile;
    if (cyc.day) {
      const toNext = cyc.nextStart ? diffDays(k, cyc.nextStart) : null;
      const sub = toNext == null ? '' : toNext > 0 ? `next in ${toNext}d` : toNext === 0 ? 'period due today' : `${-toNext}d overdue`;
      cycTile = `<div class="tile link" data-go="calendar"><div class="big">🌸</div><div class="val">Cycle day ${cyc.day}</div><div class="sub">${sub}</div><div class="sub">avg ${cyc.cycleLength}d</div></div>`;
    } else {
      cycTile = `<div class="tile link" data-go="calendar"><div class="big">🌸</div><div class="val">No cycle yet</div><div class="sub">log a period below</div></div>`;
    }
    const card = el(`<section class="card"><h2>${esc(fmtLong(k))}</h2><div class="context">
      <div class="tile"><div class="big">${moon.emoji}</div><div class="val">${moon.name}</div><div class="sub">${moon.illum}% lit</div><div class="sub">${moon.daysToFull === 0 ? 'full tonight' : 'full in ' + moon.daysToFull + 'd'}</div></div>
      ${wxTile}${cycTile}</div></section>`);
    card.querySelectorAll('[data-go]').forEach(t => t.onclick = () => { tab = t.dataset.go; render(); });
    const hints = dayNotices(k, e, moon, cyc, isToday);
    if (hints.length) {
      const nb = el(`<div class="notices"><div class="notices-title">${isToday ? 'Might be felt today' : 'Might have been felt'}</div></div>`);
      for (const [ico, text] of hints) nb.appendChild(el(`<div class="notice"><span class="ico">${ico}</span><span>${esc(text)}</span></div>`));
      nb.appendChild(el(`<div class="muted small notices-foot">General tendencies people report, not a forecast about you. Only your own logs can show what is true for you.</div>`));
      card.appendChild(nb);
    }
    view.appendChild(card);

    // copy yesterday
    const y = entries[addDays(k, -1)];
    if (y && (y.meds.length || y.foods.length) && !e.meds.length && !e.foods.length) {
      const b = el(`<button class="btn secondary" style="width:100%;margin-bottom:14px">⟲ Same food &amp; meds as ${esc(fmtDate(addDays(k, -1)).toLowerCase())}</button>`);
      b.onclick = () => { e.meds = [...y.meds]; e.foods = [...y.foods]; saveEntries(); render(); toast('Copied'); };
      view.appendChild(b);
    }

    // period
    const flowLabel = (FLOWS.find(f => f[0] === e.flow) || FLOWS[0])[1];
    const flowCard = fold('flow', 'Period', '', e.flow && e.flow !== 'none' ? flowLabel : 'none');
    const fc = flowCard.body.appendChild(el(`<div class="chips"></div>`));
    for (const [v, label] of FLOWS) {
      const c = el(`<button class="chip ${e.flow === v ? 'on' : ''}">${label}</button>`);
      c.onclick = () => { e.flow = v; saveEntries(); render(); };
      fc.appendChild(c);
    }
    view.appendChild(flowCard);

    // pain
    const painCard = fold('pain', 'Pain', 'tap an area, then set how strong', e.pains.length ? e.pains.map(p => `${p.area} ${p.level}`).join(' · ') : 'none');
    const pc = painCard.body.appendChild(el(`<div class="chips"></div>`));
    painCard.body.appendChild(el(`<div class="pain-list"></div>`));
    const areas = [...PAIN_AREAS, ...settings.customPainAreas];
    for (const a of areas) {
      const on = e.pains.some(p => p.area === a);
      const c = el(`<button class="chip ${on ? 'on' : ''}">${esc(a)}</button>`);
      c.onclick = () => {
        if (on) e.pains = e.pains.filter(p => p.area !== a); else e.pains.push({ area: a, level: 5 });
        saveEntries(); render();
      };
      pc.appendChild(c);
    }
    pc.appendChild(addChip('+ area', v => { if (!areas.includes(v)) settings.customPainAreas.push(v); saveSettings(); e.pains.push({ area: v, level: 5 }); saveEntries(); render(); }));
    const pl = painCard.body.querySelector('.pain-list');
    for (const p of e.pains) {
      const row = el(`<div class="pain-row"><div class="name">${esc(p.area)}</div><input type="range" min="1" max="10" value="${p.level}"><div class="lvl">${p.level}</div></div>`);
      const r = row.querySelector('input');
      r.oninput = () => { p.level = Number(r.value); row.querySelector('.lvl').textContent = p.level; };
      r.onchange = () => saveEntries();
      pl.appendChild(row);
    }
    view.appendChild(painCard);

    // symptoms
    const symCard = fold('symptoms', 'Symptoms', '', e.symptoms.length ? e.symptoms.join(', ') : 'none');
    const sc = symCard.body.appendChild(el(`<div class="chips"></div>`));
    const syms = [...DEFAULT_SYMPTOMS, ...settings.customSymptoms];
    for (const s of e.symptoms) if (!syms.includes(s)) syms.push(s);
    for (const s of syms) {
      const on = e.symptoms.includes(s);
      const c = el(`<button class="chip honey ${on ? 'on' : ''}">${esc(s)}</button>`);
      c.onclick = () => { e.symptoms = on ? e.symptoms.filter(x => x !== s) : [...e.symptoms, s]; saveEntries(); render(); };
      sc.appendChild(c);
    }
    sc.appendChild(addChip('+ other', v => { if (!syms.includes(v)) settings.customSymptoms.push(v); saveSettings(); if (!e.symptoms.includes(v)) e.symptoms.push(v); saveEntries(); render(); }));
    view.appendChild(symCard);

    // foods & meds
    view.appendChild(listCard('Food & drink', 'foods', e, 'sage', 'e.g. coffee, pasta, wine'));
    view.appendChild(listCard('Medicines & supplements', 'meds', e, 'sage', 'e.g. ibuprofen 400, magnesium'));

    // sleep & notes
    const miscSum = [e.sleep != null ? `${e.sleep} h slept` : '', e.notes ? 'notes' : ''].filter(Boolean).join(' · ') || 'none';
    const misc = fold('misc', 'Sleep & notes', '', miscSum);
    misc.body.appendChild(el(`<div>
      <div class="row" style="margin-bottom:10px"><label class="muted" for="sleep">Hours slept</label><input id="sleep" class="num-input" type="number" step="0.5" min="0" max="24" inputmode="decimal" value="${e.sleep ?? ''}"></div>
      <div class="row" style="align-items:flex-start"><textarea id="notes" placeholder="Anything else about today…">${esc(e.notes || '')}</textarea>
      ${speechSupported() ? '<button class="btn mic" id="notesMic" aria-label="Dictate">🎤</button>' : ''}</div></div>`));
    misc.querySelector('#sleep').onchange = ev => { e.sleep = ev.target.value === '' ? null : Number(ev.target.value); saveEntries(); };
    const notes = misc.querySelector('#notes');
    let nt; notes.oninput = () => { clearTimeout(nt); nt = setTimeout(() => { e.notes = notes.value; saveEntries(); }, 400); };
    const nm = misc.querySelector('#notesMic');
    if (nm) nm.onclick = () => listen(txt => { notes.value = (notes.value ? notes.value + ' ' : '') + txt; e.notes = notes.value; saveEntries(); }, nm);
    view.appendChild(misc);

    if (hasContent(e)) {
      const clr = el(`<button class="btn secondary small" style="width:100%">Clear this day</button>`);
      clr.onclick = () => { if (confirm('Clear everything logged for this day?')) { const w = e.weather; entries[k] = { pains: [], symptoms: [], foods: [], meds: [], flow: 'none', sleep: null, notes: '' }; if (w) entries[k].weather = w; saveEntries(); render(); } };
      view.appendChild(clr);
    }
  }

  // A card that stays folded until tapped, showing a one-line summary of what is logged.
  // Uses <details> so it works without JS quirks; open state is remembered for the session.
  function fold(id, title, hint, summary) {
    const d = el(`<details class="card fold" data-fold="${id}"${openCards.has(id) ? ' open' : ''}>
      <summary><h2>${esc(title)}${hint ? ` <span class="hint">${esc(hint)}</span>` : ''}</h2><span class="fold-sum ${summary === 'none' ? 'empty' : ''}">${esc(summary)}</span><span class="chev" aria-hidden="true">›</span></summary>
      <div class="fold-body"></div></details>`);
    d.addEventListener('toggle', () => { if (d.open) openCards.add(id); else openCards.delete(id); });
    d.body = d.querySelector('.fold-body');
    return d;
  }

  function addChip(label, onAdd) {
    const c = el(`<button class="chip ghost">${esc(label)}</button>`);
    c.onclick = () => { const v = prompt('Name it:'); if (v && v.trim()) onAdd(cap(v.trim())); };
    return c;
  }

  function listCard(title, field, e, color, placeholder) {
    const card = fold(field, title, '', e[field].length ? e[field].join(', ') : 'none');
    card.body.appendChild(el(`<div><div class="chips current"></div>
      <div class="inline-input"><input type="text" placeholder="${esc(placeholder)}" autocomplete="off" enterkeyhint="done">
      ${speechSupported() ? '<button class="btn mic" aria-label="Dictate">🎤</button>' : ''}<button class="btn">Add</button></div>
      <div class="chips recent" style="margin-top:10px"></div></div>`));
    const cur = card.querySelector('.current');
    const input = card.querySelector('input');
    const addItems = txt => {
      const items = txt.split(/,|\band\b|\n/).map(s => cap(s.trim())).filter(Boolean);
      for (const it of items) if (!e[field].includes(it)) e[field].push(it);
      saveEntries(); render();
    };
    for (const it of e[field]) {
      const c = el(`<button class="chip ${color} on">${esc(it)}<span class="x">×</span></button>`);
      c.onclick = () => { e[field] = e[field].filter(x => x !== it); saveEntries(); render(); };
      cur.appendChild(c);
    }
    if (!e[field].length) cur.appendChild(el(`<span class="muted small">Nothing yet</span>`));
    card.querySelector('.btn:not(.mic)').onclick = () => { if (input.value.trim()) addItems(input.value); };
    input.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); if (input.value.trim()) addItems(input.value); } };
    const mic = card.querySelector('.mic');
    if (mic) mic.onclick = () => listen(addItems, mic);
    const rec = card.querySelector('.recent');
    const freq = frequent(field, 12).filter(x => !e[field].includes(x));
    if (freq.length) {
      rec.appendChild(el(`<span class="muted small" style="width:100%">Tap to add again</span>`));
      for (const f of freq) { const c = el(`<button class="chip">${esc(f)}</button>`); c.onclick = () => addItems(f); rec.appendChild(c); }
    }
    return card;
  }

  // ---------- render: calendar ----------
  function renderCalendar() {
    const cyc = cycleForDate(todayKey());
    const t = todayKey();
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const monthName = calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const card = el(`<section class="card"><div class="cal-head"><button class="icon-btn" id="pm">‹</button><div class="month">${esc(monthName)}</div><button class="icon-btn" id="nm">›</button></div>
      <div class="cal-grid"></div>
      <div class="legend"><span class="l-flow">Period</span><span class="l-pred">Predicted</span><span class="l-fert">Fertile</span><span class="l-ov">Ovulation (est.)</span><span class="l-pain">Pain</span><span class="l-sym">Symptom</span><span class="l-med">Meds</span></div></section>`);
    card.querySelector('#pm').onclick = () => { calMonth = new Date(y, m - 1, 1); render(); };
    card.querySelector('#nm').onclick = () => { calMonth = new Date(y, m + 1, 1); render(); };
    const grid = card.querySelector('.cal-grid');
    const dows = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    for (const d of dows) grid.appendChild(el(`<div class="cal-dow">${d}</div>`));
    const first = new Date(y, m, 1);
    const lead = (first.getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) grid.appendChild(el(`<div class="cal-day empty"></div>`));
    const days = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const k = `${y}-${pad(m + 1)}-${pad(d)}`;
      const e = entries[k];
      const cls = [dayCycleClass(k, cyc), k === t ? 'today' : '', k > t ? 'future' : ''].join(' ');
      let dots = '';
      if (e) {
        if (e.pains.length) dots += '<span class="dot pain"></span>';
        if (e.symptoms.length) dots += '<span class="dot sym"></span>';
        if (e.meds.length) dots += '<span class="dot med"></span>';
      }
      const cell = el(`<button class="cal-day ${cls}"><span>${d}</span><span class="dots">${dots}</span></button>`);
      cell.onclick = () => { currentDate = k; tab = 'log'; render(); };
      grid.appendChild(cell);
    }
    view.appendChild(card);

    const s = el(`<section class="card"><h2>Cycle</h2><div class="stat-grid">
      <div class="stat"><div class="k">Average cycle</div><div class="v">${cyc.cycleLength} days</div><div class="muted small">${cyc.sampled ? 'from your last ' + cyc.sampled + (cyc.sampled === 1 ? ' cycle' : ' cycles') : 'default, until 2 periods are logged'}</div></div>
      <div class="stat"><div class="k">Average period</div><div class="v">${cyc.periodLength} days</div></div>
      <div class="stat"><div class="k">Last period started</div><div class="v">${cyc.lastStart ? esc(fmtDate(cyc.lastStart)) : '—'}</div></div>
      <div class="stat"><div class="k">Next expected</div><div class="v">${cyc.nextStart ? esc(fmtDate(cyc.nextStart)) : '—'}</div><div class="muted small">${cyc.ovulation ? 'ovulation est. ' + esc(fmtDate(cyc.ovulation)) : ''}</div></div>
    </div><p class="muted small" style="margin:10px 0 0">Predictions are averages of your own logs. They are rough, especially with irregular cycles.</p></section>`);
    view.appendChild(s);
  }

  // ---------- render: history ----------
  function renderHistory() {
    const keys = Object.keys(entries).filter(k => hasContent(entries[k])).sort().reverse();
    const card = el(`<section class="card"><h2>Recent days <span class="hint">${keys.length} logged</span></h2></section>`);
    if (!keys.length) card.appendChild(el(`<p class="muted">Nothing logged yet. Start on the Log tab.</p>`));
    for (const k of keys.slice(0, 90)) {
      const e = entries[k];
      const moon = moonInfo(k);
      const ctx = [moon.emoji];
      if (e.weather) ctx.push(`${e.weather.pMean} hPa${e.weather.pSwing >= 5 ? ' ⚡' : ''}`);
      const cyc = cycleForDate(k); if (cyc.day) ctx.push('cd ' + cyc.day);
      const lines = [];
      if (e.flow && e.flow !== 'none') lines.push(`<b>Period:</b> ${e.flow}`);
      if (e.pains.length) lines.push(`<b>Pain:</b> ${e.pains.map(p => esc(p.area) + ' ' + p.level).join(', ')}`);
      if (e.symptoms.length) lines.push(`<b>Symptoms:</b> ${e.symptoms.map(esc).join(', ')}`);
      if (e.meds.length) lines.push(`<b>Meds:</b> ${e.meds.map(esc).join(', ')}`);
      if (e.foods.length) lines.push(`<b>Food:</b> ${e.foods.map(esc).join(', ')}`);
      if (e.sleep != null) lines.push(`<b>Sleep:</b> ${e.sleep} h`);
      if (e.notes && e.notes.trim()) lines.push(`<b>Notes:</b> ${esc(e.notes.trim())}`);
      const item = el(`<div class="hist-item"><div class="d"><span>${esc(fmtDate(k))} <span class="muted small">${parseKey(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span></span><span class="ctx">${ctx.join(' · ')}</span></div>${lines.map(l => `<div class="l">${l}</div>`).join('')}</div>`);
      item.onclick = () => { currentDate = k; tab = 'log'; render(); };
      card.appendChild(item);
    }
    view.appendChild(card);
  }

  // ---------- render: patterns ----------
  function renderPatterns() {
    const rep = patternReport();
    const card = el(`<section class="card"><h2>Patterns in your logs <span class="hint">${rep.days} logged day${rep.days === 1 ? '' : 's'}</span></h2></section>`);
    if (rep.days < MIN_PATTERN_DAYS) {
      const pct = Math.round(rep.days / MIN_PATTERN_DAYS * 100);
      card.appendChild(el(`<p class="muted">Patterns show up once ${MIN_PATTERN_DAYS} days are logged. ${rep.days === 0 ? 'Nothing logged yet.' : `${MIN_PATTERN_DAYS - rep.days} more to go.`}</p>
        <div class="meter"><div style="width:${pct}%"></div></div>
        <p class="muted small">The more often you log food, sleep and how you feel, the more the report can compare. Empty days count as nothing to compare, not as good days.</p>`));
    } else if (!rep.findings.length) {
      card.appendChild(el(`<p class="muted">No clear patterns yet. Nothing stands out enough across the days logged so far. Keep going, especially with food, sleep and medicines, and check back in a couple of weeks.</p>`));
    } else {
      const bySym = {};
      for (const f of rep.findings) (bySym[f.symptom] = bySym[f.symptom] || []).push(f);
      for (const sym in bySym) {
        const g = el(`<div class="pat-group"><div class="pat-sym">${esc(sym)}</div></div>`);
        for (const f of bySym[sym]) {
          const rW = Math.round(f.hitsW / f.nW * 100), rO = Math.round(f.hitsO / f.nO * 100);
          g.appendChild(el(`<div class="pat-line ${f.more ? 'more' : 'less'}">
            <div class="pat-text"><b>${f.more ? 'More often' : 'Less often'}</b> ${esc(f.label)}: on ${f.hitsW} of ${f.nW} days, compared with ${f.hitsO} of ${f.nO} other days.</div>
            <div class="pat-bars"><div class="pat-bar"><span style="width:${rW}%"></span><i>${rW}%</i></div><div class="pat-bar other"><span style="width:${rO}%"></span><i>${rO}%</i></div></div></div>`));
        }
        card.appendChild(g);
      }
      card.appendChild(el(`<p class="muted small" style="margin:12px 0 0">Correlation, not cause. A medicine taken <i>for</i> a symptom will naturally show up next to it. Food and medicine counts include the day after they were logged.</p>`));
    }
    view.appendChild(card);

    // tests and courses
    const rf = recordFindings();
    if (rf.length) {
      const rc = el(`<section class="card"><h2>Tests &amp; courses</h2></section>`);
      for (const { record: r, lines } of rf) {
        const when = r.type === 'test' ? fmtShort(r.date) : `${fmtShort(r.start)} → ${r.end ? fmtShort(r.end) : 'still taking'}`;
        const g = el(`<div class="pat-group"><div class="pat-sym">${r.type === 'test' ? '🧪' : '💊'} ${esc(r.name)} <span class="muted small">${esc(when)}</span></div></div>`);
        for (const l of lines) g.appendChild(el(`<div class="rec-line ${l.flag}">${esc(l.text)}</div>`));
        rc.appendChild(g);
      }
      rc.appendChild(el(`<p class="muted small" style="margin:12px 0 0">Ranges come from what you typed off the result sheet. Doily cannot judge what a value means for you, only a doctor can.</p>`));
      view.appendChild(rc);
    }

    // for your doctor
    const doc = el(`<section class="card"><h2>For your doctor</h2>
      <p class="muted small" style="margin:0 0 10px">A plain-text summary of the last 90 days, your records and the patterns above. No name, no location. Pick the language the specialist reads.</p>
      <div class="chips lang"></div>
      <div class="row" style="margin-top:12px"><button class="btn" id="docCopy">📋 Copy summary</button>${navigator.share ? '<button class="btn secondary" id="docShare">↗ Share</button>' : ''}</div></section>`);
    const lc = doc.querySelector('.lang');
    for (const [code, name] of LANGS) { const c = el(`<button class="chip sage ${settings.docLang === code ? 'on' : ''}">${name}</button>`); c.onclick = () => { settings.docLang = code; saveSettings(); render(); }; lc.appendChild(c); }
    const preview = fold('docPreview', 'Preview', '', ''); preview.classList.add('inner');
    preview.body.appendChild(el(`<pre class="doc-preview">${esc(buildDoctorSummary(settings.docLang))}</pre>`));
    preview.querySelector('.fold-sum').remove();
    doc.appendChild(preview);
    doc.querySelector('#docCopy').onclick = async () => { toast(await copyText(buildDoctorSummary(settings.docLang)) ? 'Copied. Paste it into a message or note.' : 'Could not copy on this browser'); };
    const sh = doc.querySelector('#docShare');
    if (sh) sh.onclick = () => navigator.share({ title: 'Doily summary', text: buildDoctorSummary(settings.docLang) }).catch(() => { });
    view.appendChild(doc);

    // records card
    const recCard = fold('records', 'Medical records', 'tests, courses, notes', records.length ? `${records.length} record${records.length === 1 ? '' : 's'}` : 'none');
    const body = recCard.body;
    const types = [['test', '🧪 Test result'], ['course', '💊 Medicine or supplement course'], ['note', '📝 Note']];
    const tc = body.appendChild(el(`<div class="chips" style="margin-bottom:10px"></div>`));
    for (const [v, label] of types) { const c = el(`<button class="chip sage ${recType === v ? 'on' : ''}">${label}</button>`); c.onclick = () => { recType = v; render(); }; tc.appendChild(c); }
    const t = todayKey();
    let form;
    if (recType === 'test') form = el(`<div class="rec-form">
      <div class="field"><label>What was tested</label><input type="text" id="rName" placeholder="e.g. Ferritin, Vitamin D, TSH" autocomplete="off"></div>
      <div class="row"><div class="field" style="flex:1"><label>Date</label><input type="date" id="rDate" value="${t}" max="${t}"></div>
      <div class="field" style="flex:1"><label>Result</label><input type="text" id="rValue" inputmode="decimal" placeholder="e.g. 12"></div>
      <div class="field" style="flex:1"><label>Unit</label><input type="text" id="rUnit" placeholder="µg/L"></div></div>
      <div class="row"><div class="field" style="flex:1"><label>Range low (from the sheet)</label><input type="text" id="rLow" inputmode="decimal" placeholder="optional"></div>
      <div class="field" style="flex:1"><label>Range high</label><input type="text" id="rHigh" inputmode="decimal" placeholder="optional"></div></div>
      <div class="field"><label>Notes</label><input type="text" id="rNotes" placeholder="optional, e.g. which lab, fasting"></div></div>`);
    else if (recType === 'course') form = el(`<div class="rec-form">
      <div class="field"><label>Medicine or supplement, with dose</label><input type="text" id="rName" placeholder="e.g. Vitamin D 2000 IU daily" autocomplete="off"></div>
      <div class="row"><div class="field" style="flex:1"><label>Started</label><input type="date" id="rStart" value="${t}"></div>
      <div class="field" style="flex:1"><label>Stopped</label><input type="date" id="rEnd"><span class="muted small">blank = still taking</span></div></div>
      <div class="field"><label>Notes</label><input type="text" id="rNotes" placeholder="optional, e.g. prescribed for…"></div></div>`);
    else form = el(`<div class="rec-form">
      <div class="field"><label>Title</label><input type="text" id="rName" placeholder="e.g. Doctor visit, diagnosis, scan" autocomplete="off"></div>
      <div class="field"><label>Date</label><input type="date" id="rDate" value="${t}"></div>
      <div class="field"><label>Notes</label><input type="text" id="rNotes" placeholder="what was said or found"></div></div>`);
    body.appendChild(form);
    const addBtn = body.appendChild(el(`<button class="btn" style="width:100%">Add record</button>`));
    addBtn.onclick = () => {
      const g = id => { const x = form.querySelector('#' + id); return x ? x.value.trim() : ''; };
      const name = g('rName'); if (!name) { toast('Give it a name first'); return; }
      const r = { id: Date.now().toString(36), type: recType, name: cap(name), notes: g('rNotes') };
      if (recType === 'course') { r.start = g('rStart') || t; r.end = g('rEnd') || null; if (r.end && r.end < r.start) { toast('Stopped date is before the start'); return; } }
      else { r.date = g('rDate') || t; }
      if (recType === 'test') { r.value = g('rValue'); r.unit = g('rUnit'); r.low = g('rLow') || null; r.high = g('rHigh') || null; }
      records.push(r); saveRecords(); render(); toast('Record added');
    };
    if (records.length) {
      const list = body.appendChild(el(`<div class="rec-list"></div>`));
      for (const r of records) {
        const ico = { test: '🧪', course: '💊', note: '📝' }[r.type];
        let detail = '';
        if (r.type === 'test') detail = `${fmtShort(r.date)}${r.value ? ' · ' + esc(r.value) + ' ' + esc(r.unit || '') : ''}${r.low || r.high ? ' · range ' + esc(r.low ?? '…') + '–' + esc(r.high ?? '…') : ''}`;
        else if (r.type === 'course') detail = `${fmtShort(r.start)} → ${r.end ? fmtShort(r.end) : 'still taking'}`;
        else detail = fmtShort(r.date);
        const row = el(`<div class="rec-item"><div class="rec-main"><div class="rec-name">${ico} ${esc(r.name)}</div><div class="muted small">${detail}</div>${r.notes ? `<div class="muted small">${esc(r.notes)}</div>` : ''}</div><div class="rec-actions"></div></div>`);
        const act = row.querySelector('.rec-actions');
        if (r.type === 'course' && !r.end) { const stop = el(`<button class="btn secondary small">Stopped today</button>`); stop.onclick = () => { r.end = t; saveRecords(); render(); }; act.appendChild(stop); }
        const del = el(`<button class="icon-btn small" aria-label="Delete record">×</button>`);
        del.onclick = () => { if (confirm(`Delete "${r.name}"?`)) { records = records.filter(x => x.id !== r.id); saveRecords(); render(); } };
        act.appendChild(del);
        list.appendChild(row);
      }
    }
    body.appendChild(el(`<p class="muted small" style="margin:10px 0 0">Records stay on this phone like everything else and are included in backups.</p>`));
    view.appendChild(recCard);
  }

  // ---------- render: settings ----------
  function renderSettings() {
    const loc = el(`<section class="card"><h2>Location <span class="hint">for weather &amp; pressure</span></h2>
      <p class="muted small" style="margin:0 0 10px">${settings.place ? 'Current: <b>' + esc(settings.place) + '</b>' : 'Not set yet.'} Weather comes from Open-Meteo, free and without an account.</p>
      <div class="row"><button class="btn sage" id="geo">📍 Use my location</button></div>
      <div class="inline-input"><input type="text" id="citySearch" placeholder="or search a town…"><button class="btn secondary" id="cityBtn">Search</button></div>
      <div class="geo-results" id="geoResults"></div></section>`);
    loc.querySelector('#geo').onclick = () => {
      if (!navigator.geolocation) return toast('Location not available on this device');
      toast('Finding you…');
      navigator.geolocation.getCurrentPosition(async pos => {
        settings.lat = Math.round(pos.coords.latitude * 100) / 100; settings.lon = Math.round(pos.coords.longitude * 100) / 100;
        settings.place = `${settings.lat}, ${settings.lon}`;
        saveSettings(); await fetchWeather(true); render(); toast('Location saved');
      }, () => toast('Could not get location. Try searching a town.'), { timeout: 10000 });
    };
    const doSearch = async () => {
      const q = loc.querySelector('#citySearch').value.trim(); if (!q) return;
      const res = loc.querySelector('#geoResults'); res.innerHTML = '<span class="muted small">Searching…</span>';
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en`);
        const j = await r.json(); res.innerHTML = '';
        if (!j.results || !j.results.length) { res.innerHTML = '<span class="muted small">No matches</span>'; return; }
        for (const g of j.results) {
          const b = el(`<button>${esc(g.name)}${g.admin1 ? ', ' + esc(g.admin1) : ''} <span class="muted small">${esc(g.country || '')}</span></button>`);
          b.onclick = async () => { settings.lat = g.latitude; settings.lon = g.longitude; settings.place = g.name + (g.country ? ', ' + g.country : ''); saveSettings(); await fetchWeather(true); render(); toast('Location saved'); };
          res.appendChild(b);
        }
      } catch { res.innerHTML = '<span class="muted small">Search failed, are you online?</span>'; }
    };
    loc.querySelector('#cityBtn').onclick = doSearch;
    loc.querySelector('#citySearch').onkeydown = ev => { if (ev.key === 'Enter') doSearch(); };
    view.appendChild(loc);

    const cyc = el(`<section class="card"><h2>Cycle defaults <span class="hint">used until enough periods are logged</span></h2>
      <div class="row"><div class="field" style="flex:1"><label>Cycle length (days)</label><input type="number" id="cl" min="15" max="60" value="${settings.cycleLength}"></div>
      <div class="field" style="flex:1"><label>Period length (days)</label><input type="number" id="pl" min="1" max="10" value="${settings.periodLength}"></div></div></section>`);
    cyc.querySelector('#cl').onchange = ev => { settings.cycleLength = Math.min(60, Math.max(15, Number(ev.target.value) || 28)); saveSettings(); };
    cyc.querySelector('#pl').onchange = ev => { settings.periodLength = Math.min(10, Math.max(1, Number(ev.target.value) || 5)); saveSettings(); };
    view.appendChild(cyc);

    const data = el(`<section class="card"><h2>Your data</h2>
      <p class="muted small" style="margin:0 0 10px">Everything is stored only on this phone. Export a backup now and then, and after a phone change import it here.</p>
      <div class="row"><button class="btn" id="exp">⬇ Export backup</button><button class="btn secondary" id="imp">⬆ Import backup</button><input type="file" id="impFile" accept="application/json,.json" class="visually-hidden"></div>
      <div class="row" style="margin-top:14px"><button class="btn danger small" id="wipe">Delete everything</button></div></section>`);
    data.querySelector('#exp').onclick = () => {
      const blob = new Blob([JSON.stringify({ app: 'doily', version: 1, exportedAt: new Date().toISOString(), settings, entries, records }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `doily-backup-${todayKey()}.json`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    data.querySelector('#imp').onclick = () => data.querySelector('#impFile').click();
    data.querySelector('#impFile').onchange = ev => {
      const f = ev.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const j = JSON.parse(rd.result);
          if (!j.entries) throw new Error('bad');
          const mode = Object.keys(entries).length ? confirm('Merge with what is already here? OK = merge, Cancel = replace everything.') : false;
          entries = mode ? { ...entries, ...j.entries } : j.entries;
          if (j.settings) settings = Object.assign(settings, j.settings);
          if (Array.isArray(j.records)) { const ids = new Set(records.map(r => r.id)); records = mode ? [...records, ...j.records.filter(r => !ids.has(r.id))] : j.records; }
          saveEntries(); saveSettings(); saveRecords(); render(); toast('Backup imported');
        } catch { toast('That file does not look like a Doily backup'); }
      };
      rd.readAsText(f);
    };
    data.querySelector('#wipe').onclick = () => {
      if (confirm('Delete every log and setting? This cannot be undone.') && confirm('Really delete everything?')) {
        localStorage.removeItem(ENTRIES_KEY); localStorage.removeItem(SETTINGS_KEY); localStorage.removeItem(WEATHER_CACHE_KEY); localStorage.removeItem(RECORDS_KEY); location.reload();
      }
    };
    view.appendChild(data);

    const about = el(`<section class="card"><h2>About</h2><p class="muted small" style="margin:0">Doily v1. Moon phases are calculated on the device. Weather and town search use the free Open-Meteo service and are the only things that leave your phone.${speechSupported() ? '' : ' Voice input is not available in this browser.'}</p></section>`);
    view.appendChild(about);
  }

  // ---------- wiring ----------
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
  document.getElementById('prevDay').onclick = () => { currentDate = addDays(currentDate, -1); tab = 'log'; render(); };
  document.getElementById('nextDay').onclick = () => { currentDate = addDays(currentDate, 1); tab = 'log'; render(); };
  const dp = document.getElementById('datePicker');
  document.getElementById('dateLabel').onclick = () => { if (dp.showPicker) { try { dp.showPicker(); return; } catch { } } dp.click(); };
  dp.onchange = () => { if (dp.value) { currentDate = dp.value; tab = 'log'; render(); } };

  render();
  fetchWeather(false).then(() => { if (tab === 'log') render(); });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const t = todayKey();
      if (currentDate !== t && tab === 'log' && !hasContent(entries[currentDate])) { currentDate = t; render(); }
      fetchWeather(false).then(() => { if (tab === 'log') render(); });
    }
  });
})();
