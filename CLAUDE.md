# CLAUDE.md — Doily

Read this first when working in this folder.

## What Doily is

A cosy, free health diary web app. Named after the little knitted decorations grandmas make. Built on 2026-09-14 as version 1.

The end user is a friend of the repo owner, not the owner. She wants one place to log how she feels and see it next to things that might explain it: moon phase, air pressure, her menstrual cycle, what she ate, what medicines she took. She asked for input to be as easy as possible. She uses an **Android** phone.

Hard constraints from the original brief:

- **Everything must stay free.** No paid APIs, no app store fees, no subscriptions.
- **Easy input above all.** Tap chips, sliders, voice, "same as yesterday". Never a long form.
- **Private by default.** Health data lives on the phone. The only network calls are to Open-Meteo (weather and town search, no key, no account).
- **Not medical advice.** Every screen carries a disclaimer. Reports describe correlations in her own logs, never diagnoses.

## Decisions already made (do not re-litigate)

| Question | Decision | Why |
|---|---|---|
| Platform | Progressive web app, vanilla HTML/CSS/JS, no build step | Free hosting on GitHub Pages, installable on Android from Chrome, no framework churn. Can be wrapped for Play Store later (one-time fee) with no code changes. |
| Storage | `localStorage`, JSON, keyed by `YYYY-MM-DD` | Small data, zero setup, easy export. Backup export/import is the sync story. |
| Weather | Open-Meteo forecast API with `past_days=2`, pressure from `pressure_msl` | Free, no key, gives hourly history so past days keep a pressure snapshot. |
| Moon | Computed on device with Meeus low-precision formula (`moonFraction`) | Matches real new/full moon times within minutes. Mean-cycle math was half a day off and was replaced. |
| Cycle prediction | Average of her last 6 cycle lengths; ovulation = next start minus 14 days; fertile window = ovulation −5 to +1 | Simple, transparent, uses only her own logs. Spotting never counts as a period start. A predicted period more than 14 days late rolls forward to the next cycle. |
| AI (version 2) | Her own free Gemini API key, Flash model, sent a de-identified daily summary. Optional. | Free tier is plenty for a couple of reports a day. Free-tier prompts may be used by Google for training, so never send names, exact dates, or location. Rule-based pattern reports must work with AI switched off. Gemini Nano on-device is not available on Android Chrome as of Sept 2026. |
| Reading test sheets | Tesseract.js 7 (WebAssembly OCR) loaded on demand from jsDelivr, languages `lit+eng`, OEM 1, `rotateAuto`. Parsed rows are always shown for her to tick and correct before saving. | Free, keyless, the photo stays on the phone. Gemini vision would read better but needs a key and sends the photo to Google; it can be offered later as an opt-in alongside the v2 Gemini summary. Pasting text is offered too, for PDF or portal results. |
| Name and look | "doily", **pineapple palette** (cream ground, pineapple gold, deep rind amber, leaf green, warm coral kept for period days) with crochet detailing: tiled lace motif on the body, cards with a chain-stitch dotted ring and scalloped hem, scalloped top bar and tab bar, serif brand mark with a small doily glyph, round lace icon | Warm and grandma-ish on purpose. Owner chose pineapple colours on 2026-09-21 (replaced the rose/sage v1 palette). Lace edges are pure CSS radial-gradient scallops, no images. |

## Files

```
index.html            shell: top bar with day arrows and date picker, main view, bottom tab bar (Log, Calendar, Patterns, History, Settings)
style.css             all styling, mobile-first, CSS variables at the top
app.js                everything else, one IIFE, sections marked with // ---------- headers
sw.js                 service worker: cache app shell, network for Open-Meteo
manifest.webmanifest  PWA manifest, icons in icons/
icons/                icon.svg source; run `python3 make_icons.py` in that folder to regenerate the PNGs (pure Python, no PIL on this machine, ~10 s)
README.md             user-facing: features, run locally, deploy to GitHub Pages, data format, v2 list
```

### app.js layout

- **constants**: default symptom chips, pain areas, flow levels, moon names, WMO weather codes
- **state**: `entries`, `settings`, `currentDate`, `tab`, `calMonth`, `weather` (cached, 30 min)
- **helpers**: date keys, `entry(k)` creates a blank day, `hasContent(e)`, `toast`
- **moon**: `moonFraction(date)`, `moonInfo(k)`
- **cycle**: `periodStarts()`, `cycleStats()`, `cycleForDate(k)`, `dayCycleClass(k, cyc)`
- **weather**: `fetchWeather(force)` also stamps per-day snapshots into `entry.weather` for today and past days, never overwriting an older snapshot with a forecast
- **notices**: `dayNotices(k, e, moon, cyc, isToday)` returns up to 4 `[emoji, sentence]` hints shown in the context card ("Might be felt today"): pressure drops/lows, heat, humidity, storms, full/new moon, days before a period, first period days, ovulation, short sleep last night. Phrased as general tendencies people report, never as a prediction or advice, and always followed by the "not a forecast about you" line. After the general hints, up to 2 personal findings from `patternReport()` whose factor applies to that day ("In your own logs, Headache came up on 8 of 12 days when pressure fell…").
- **speech**: Web Speech API, mic button only rendered when supported
- **render**: `render()` dispatches to `renderLog`, `renderCalendar`, `renderPatterns`, `renderHistory`, `renderSettings`; `listCard` builds the food and meds cards; `renderPatterns` = findings card, tests & courses card, and the folded Medical records card with its add form (`recType` picks the form)
- **records**: `records[]` in `doily.records.v1`, four shapes: test `{id,type:'test',name,date,value,unit,low,high,notes}`, course `{id,type:'course',name,start,end|null,notes}` (end null = still taking), condition `{id,type:'condition',name,start,end|null,notes}` (illness, diagnosis, allergy or operation; `start`/`end` may be `YYYY`, `YYYY-MM` or a full date, normalised by `normWhen`, shown by `fmtWhen`; end null = ongoing), note `{id,type:'note',name,date,notes}`. `courseActive(r,k)`, `conditionActive(r,k)` (only conditions with a full-date start count as a day factor `cond:id`). Included in backup export/import (merge dedupes by id) and wiped by Delete everything.
- **scan**: `loadTesseract()` injects the CDN script once; `ocrFile(file, onProgress)` downsizes the photo to 2200 px on a canvas, greys it with a little contrast, and runs a `lit+eng` worker with `rotateAuto`. `parseResultSheet(text)` → `{date, rows:[{name,value,unit,low,high}]}`: per line, first free-standing number is the value (numbers glued to letters like B12, 25-OH, 10^9 are not), a `13 - 150`, `< 5` or `> 30` is the range, first unit-looking token after the value is the unit, a bare integer with neither unit nor range is dropped. Date = first date on the sheet within the last two years (skips birth dates). `scan` holds the candidate rows across re-renders; `scanBlock(form)` renders photo/paste buttons, the tickable rows and a "What was read" fold inside the test form. Tested in Node by extracting the helpers and the scan section (see scratch tests pattern below).
- **patterns**: `loggedDays()` (days with `hasContent`), `daySymptoms(e)` (symptoms plus pain areas at level 4+ as "Head pain"), `dayFactors(k)` (pressure drop/rise ≥4 hPa vs previous day's `pMean`, swing ≥8, low ≤1000, short sleep last night, full/new moon by illumination, menses/premens/ovulation from `cycleForDate`, `food:X` and `med:X` for today or yesterday, `course:id`), `patternReport()` → findings per symptom with `hitsW/nW` vs `hitsO/nO`. Thresholds: `MIN_PATTERN_DAYS` = 14, symptom ≥3 days, factor ≥3 days with and without, "more" = rate ≥ other + 20 points and ≥ 1.5×, "less" = mirror; max 4 per symptom. `compareWindow(days)` and `recordFindings()` do the 30-days-before-a-test and 60-days-before vs during-a-course comparisons (need ≥5 logged days each side). Out-of-range tests only use the range she typed from the sheet; the app never hardcodes reference ranges.
- **doctor summary**: `buildDoctorSummary(lang, style)` makes plain text (ISO dates, `## ` headings) with cycle stats, symptom and pain frequency over the last 90 logged days, meds frequency, courses, tests with the typed range and BELOW/ABOVE RANGE flags, notes, and the pattern findings. `I18N` holds `lt`, `en`, `ru` (`LANGS`); only fixed vocabulary is translated (default symptoms, pain areas, flow, factor labels, headings), her own typed words stay verbatim. Language saved in `settings.docLang` (default `lt`), layout in `settings.docStyle` (`conv` | `fm`). `style === 'fm'` goes to `buildFunctionalSummary(lang)`: timeline of records in date order, symptoms grouped by body system via `FM_NODES` (after the IFM matrix: assimilation, energy, communication, defence/repair, structural; custom words land in "Other"), hormonal rhythm (cycle stats plus cycle-factor findings), modifiable lifestyle factors (sleep average and short nights, top foods, top meds, courses), triggers grouped by `factorGroup` (food, med, env, sleep, cond), labs. No "optimal" ranges, ever: only the range she typed. Shared pieces: `recentCounts`, `symLine`, `painLine`, `testLine`, `findingLine`, `summaryHead`, `cycleLines`. `copyText` uses the clipboard API with an execCommand fallback; a Share button appears when `navigator.share` exists (Android). Preview shown in a nested `details.fold.inner`.
- **folding**: every log card except the context card is a `<details class="card fold">` built by `fold(id, title, hint, summary)`. Cards start closed to avoid mis-taps while scrolling; the summary line shows what is logged. Open ids live in the `openCards` Set for the session, so a card stays open across the re-render that every chip tap triggers.
- **wiring**: tabs, day arrows, date picker, service worker registration, refetch weather when the app becomes visible
- **no jumping**: `render()` compares `tab|date` with the previous render; only a real move scrolls to the top, otherwise it restores `scrollY`. `refocus` (a `data-focus` value) puts the cursor back in a list input after adding with Enter. Added 2026-10-19 after the owner reported the app jumping back after every input.

Autosave on every change. `saveEntries()` prunes days with no content and no weather snapshot.

### Data model

```json
"2026-09-14": {
  "pains": [{ "area": "Head", "level": 6 }],
  "symptoms": ["Nausea"],
  "foods": ["Coffee", "Pasta"],
  "meds": ["Ibuprofen 400"],
  "flow": "none | spotting | light | medium | heavy",
  "sleep": 6.5,
  "notes": "",
  "weather": { "pMin": 1003, "pMax": 1011, "pMean": 1007, "pSwing": 8, "tMin": 12, "tMax": 19, "code": 61 }
}
```

Settings: `lat`, `lon`, `place`, `cycleLength` (default 28), `periodLength` (default 5), `customSymptoms[]`, `customPainAreas[]`, `docLang` (`lt` | `en` | `ru`), `docStyle` (`conv` | `fm`).

localStorage keys: `doily.entries.v1`, `doily.settings.v1`, `doily.weather.v1`, `doily.records.v1`. Bump the suffix and write a migration if the shape changes.

Service worker cache name is `doily-v3` in sw.js. Bump it whenever style.css, index.html or app.js change, otherwise installed phones keep serving the old shell.

## Deployment

GitHub repo `ievonzas/doily`, GitHub Pages from `main` branch root, live at https://ievonzas.github.io/doily/ (first deployed 2026-09-21). Pushing to `main` redeploys within a minute or two. Bump the service worker cache name in sw.js with every push that changes the shell, or installed phones keep the old version.

## Running and testing

```
python3 -m http.server 8080      # then open http://localhost:8080
node --check app.js              # syntax
```

There is **no working headless Chromium on this machine** (Playwright's cached build is missing libatk). Test instead with:

- **Pure logic in Node**: extract the helpers, moon and cycle sections from app.js into a script with stubbed `entries` and `settings`. Known 2026 moon instants for checks: new 2026-01-18 19:52 UTC, full 2026-01-03 10:03 UTC, new 2026-09-11 03:27 UTC, full 2026-09-26 16:49 UTC.
- **DOM smoke test with jsdom** from `../hades/node_modules/jsdom` (construct with `runScripts: 'outside-only'` so `window.eval` runs in the page context): load index.html, stub `fetch` with a fake Open-Meteo payload, stub `scrollTo`, `confirm`, `prompt`, `navigator.geolocation`, seed localStorage, eval app.js, click through the tabs. Tab buttons start with an icon glyph, so select them by `data-tab`. Folded cards need `.open = true` plus a dispatched `toggle` event. For the sheet parser, cut the `pad`…`fmtDate` helpers and the `const NUM`…`let scan` block out of app.js into `new Function` and feed it sample sheet text with decimal commas.
- The camera and OCR path cannot be tested here; check it on the phone on the deployed URL with a real printout.
- On a phone: GPS and the install prompt need HTTPS, so test those on the deployed URL.

Do not run `pkill -f "http.server"` from a Bash tool call: the pattern matches the calling shell. Use `pgrep -f "http.serve[r]"` style patterns.

## Conventions

- Keep it dependency-free. No bundler, no framework, no npm.
- Everything must work offline except live weather.
- Tap targets at least 44 px. Chips, not dropdowns. Autosave, no save buttons.
- Any new network call must be free, keyless, and mentioned in the Settings "About" text.
- Keep the disclaimer at the bottom of every view.
- Pronoun for the end user in docs: she/her (stated by the owner).
- The app UI is English. Only the doctor summary is translated; keep `I18N` entries complete when adding a key.

## Version 2 plan

0. ~~Owner's 2026-10-19 ideas~~ **Done 2026-10-19**: scan a test sheet by photo or pasted text, functional medicine layout of the doctor summary, illness/diagnosis records, no scroll jump after inputs.
1. ~~Pattern reports~~ **Done 2026-09-21** as the Patterns tab, plus medical records (tests, courses, notes) feeding the report. Also done: "For your doctor" copy/share summary in Lithuanian, English or Russian (owner is in Lithuania; specialists read different languages). Possible follow-up: symptom-by-cycle-day view. To add a language, add an `I18N` entry and a `LANGS` row.
2. **Optional Gemini summary.** Settings field for her own API key, stored only in localStorage. Build a de-identified text summary of the day and recent patterns, call the Gemini Flash model directly from the browser, show the answer in a card. Works with the key blank (feature hidden). With a key present, the same model could also read a result-sheet photo more reliably than Tesseract, as an opt-in next to "Scan a photo".
3. **Charts**: pressure and pain over the last 30 days, symptoms by cycle day.
4. **Reminders** via web push or a simple daily notification to log.
5. **Nice to have**: quick links to MedlinePlus for meds, photo attachment for rashes, dark theme.
