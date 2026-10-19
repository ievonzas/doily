# Doily

A cosy health diary that lives on your phone. Log how you feel, what you ate and what you took, next to the moon phase, air pressure and your cycle, all in one place.

Named after the little knitted decorations grandmas make.

## What version 1 does

- **Log tab**: period flow, pain by body area with a 1–10 slider, symptom chips, food and medicine lists with voice input, hours slept, free notes. Each section stays folded until tapped, with a one-line summary of what is logged. One tap copies yesterday's food and meds.
- **Context card**: moon phase and illumination, current air pressure with the 24 h change and the next 12 h trend, cycle day and days until the next period.
- **Calendar**: period days, predicted periods, estimated fertile window and ovulation, plus dots for pain, symptoms and meds. Tap a day to open it.
- **Patterns**: once 14 days are logged, plain sentences about what clusters with what in your own logs, such as "Headache more often when pressure fell 4 hPa or more: on 8 of 12 days, compared with 2 of 48 other days". Looks at air pressure, sleep, moon, cycle phase, and food or medicines from the last day. Correlation, not cause, and it says so.
- **Medical records**: blood test results with the range from the sheet, medicine or supplement courses, illnesses and diagnoses (past or ongoing, a year is enough), and notes such as doctor visits. The report flags results outside their printed range and compares how you felt in the month before a test, or before and during a course.
- **Scan a result sheet**: snap a photo of the lab printout, or paste its text, and Doily reads the names, numbers, units and ranges into editable rows for you to tick and add. Reading happens on the phone; the photo is never uploaded. The reader and its Lithuanian and English language files are fetched once from a free CDN, so the first scan needs internet.
- **Might be felt today**: the day's weather, moon, cycle and last night's sleep turn into gentle notes about what people often feel on such days, followed by anything your own logs show for days like this.
- **For your doctor**: one tap copies or shares a plain-text summary of the last 90 days, records and patterns, in Lithuanian, English or Russian. No name or location in it. Two layouts: the conventional one (cycle, symptom and medicine frequency, records, patterns) and a functional medicine one (timeline, symptoms grouped by body system, hormonal rhythm, lifestyle factors, possible triggers, labs). Same facts either way, only the arrangement changes.
- **History**: every logged day with its moon, pressure and cycle day, so patterns are easy to spot by eye.
- **Settings**: location by GPS or town search, cycle defaults, export and import of a backup file, delete everything.

Everything is stored in the browser on the device. The only network calls are to [Open-Meteo](https://open-meteo.com/) for weather and town search, which is free and needs no account, and a one-time download of the [Tesseract.js](https://github.com/naptha/tesseract.js) reader from the jsDelivr CDN when you first scan a result sheet.

## Run it locally

Any static file server works. From this folder:

```
python3 -m http.server 8080
```

Then open http://localhost:8080 in Chrome. To test on a phone on the same Wi-Fi, use your computer's IP instead of localhost. Note that GPS and the install prompt need HTTPS, so on a phone those work only once the app is hosted.

## Put it online for free

The live copy is at **https://ievonzas.github.io/doily/**. Open it in Chrome on Android and choose **Add to Home screen**.

To host your own copy:

1. Create a GitHub repository and push this folder.
2. In the repository settings, turn on **Pages** for the main branch, root folder.
3. Open the Pages URL in Chrome on Android, then choose **Add to Home screen** from the menu.

Cloudflare Pages or Netlify work the same way, drag the folder in and you get an HTTPS link.

## Data format

Backups are plain JSON with `entries`, `settings` and `records`. Each day in `entries` is keyed by `YYYY-MM-DD`:

```json
{
  "pains": [{ "area": "Head", "level": 6 }],
  "symptoms": ["Nausea"],
  "foods": ["Coffee", "Pasta"],
  "meds": ["Ibuprofen 400"],
  "flow": "none",
  "sleep": 6.5,
  "notes": "",
  "weather": { "pMin": 1003, "pMax": 1011, "pMean": 1007, "pSwing": 8, "tMin": 12, "tMax": 19, "code": 61 }
}
```

`records` is a list of test results (`name, date, value, unit, low, high`), courses (`name, start, end`), conditions (`name, start, end`, where a date may be just a year or year-month) and notes (`name, date, notes`).

## Planned for version 2

- Optional AI summary of a de-identified day using the user's own free Gemini API key.
- Charts and reminders.

Doily keeps notes. It does not give medical advice.
