# Timetable import review

Source: T:/SLIIT/Project/bus-schedule/Mahiyanganaya_Bus_Timetable.xlsx

146 service rows extracted. No data has been published.

Owner decision (2026-11-13): preserve missing values as blank for later correction. JSON stores blanks as null and preserves separate original times and AM/PM cells. No defaults or extra departures were invented. This is staged source data, not a publishable schedule document. The current Worker and TV require operator, service type, operating days and an unambiguous 24-hour departure. Directly publishing incomplete records would fail validation. Redeployment cannot resolve these missing fields.

## Missing AM/PM values

| Excel row | Route | Departure | Arrival |
| --- | --- | --- | --- |
| 3 | Kataragama → Jaffna | 12:45 MISSING AM/PM | 12:45 MISSING AM/PM |
| 9 | Katunayake → Akkaraipattu | 12:15 PM | 12:00 MISSING AM/PM |
| 11 | Kalmunai → Colombo | 12:00 MISSING AM/PM | 11:50 AM |
| 12 | Bibile → Colombo | 12:00 MISSING AM/PM | 11:50 MISSING AM/PM |
| 13 | Bibile → Kandy | 12:00 MISSING AM/PM | 11:50 AM |
| 31 | Bibile → Colombo | 10:45 MISSING AM/PM | 10:30 MISSING AM/PM |
| 50 | Ampara → Colombo | 09:45 MISSING AM/PM | 09:40 MISSING AM/PM |
| 63 | Ampara → Colombo | 09:00 MISSING AM/PM | 08:45 MISSING AM/PM |
| 78 | Akkaraipattu → Colombo | 08:20 MISSING AM/PM | 08:10 MISSING AM/PM |
| 84 | Bibile → Colombo | 08:00 MISSING AM/PM | 07:45 MISSING AM/PM |
| 145 | Diyatalawa → Trincomalee | 01:00 AM | 12:30 MISSING AM/PM |

## Required mapping decisions

- No operator column exists. Every row needs CTB or PVT, or an explicit decision to support an unknown operator in the app.
- No operating days column exists. Confirm whether all departures run daily.
- 140 rows have no service type. Confirm whether these mean NORMAL.
- Row 37 says Air-conditioned. The app supports NORMAL, SEMI_LUXURY, LUXURY and EXPRESS. Confirm its category.
- Rows 5 and 6 share origin, destination and times. Row 6 says Luxury and row 5 has no service type. Confirm whether these are two buses or a duplicate.
- The additional note says Mahiyanganaya–Badulla runs every 15 minutes from 05:00 to 17:15 (50 departures including both endpoints). Confirm inclusion, operating days, operator and service type.

After clarification, validate all records and publish a new increasing snapshot version. Preserve the existing snapshot and update the live pointer atomically.
