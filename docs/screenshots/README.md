# TV browser verification

Chrome captures from `npm run dev:tv`. The date override is Colombo local time.
Each image is below 400 KB.

| Scenario       | Preview query                                 | 1920×1080                        | 1280×720                         |
| -------------- | --------------------------------------------- | -------------------------------- | -------------------------------- |
| Thursday 15:37 | `?mock=1&now=2026-11-12T15:37`                | [Image](afternoon-1920.jpg)      | [Image](afternoon-1280.jpg)      |
| Thursday 23:50 | `?mock=1&now=2026-11-12T23:50`                | [Image](tomorrow-1920.jpg)       | [Image](tomorrow-1280.jpg)       |
| Friday 00:20   | `?mock=1&now=2026-11-13T00:20`                | [Image](departed-1920.jpg)       | [Image](departed-1280.jpg)       |
| Three rows     | `?mock=1&now=2026-11-12T15:37&rows=3`         | [Image](three-rows-1920.jpg)     | [Image](three-rows-1280.jpg)     |
| Six rows       | `?mock=1&now=2026-11-12T15:37&rows=6`         | [Image](six-rows-1920.jpg)       | [Image](six-rows-1280.jpg)       |
| Critical alert | `?mock=1&now=2026-11-12T15:37&alert=critical` | [Image](critical-alert-1920.jpg) | [Image](critical-alert-1280.jpg) |
| Unavailable    | `?unavailable=1&now=2026-11-12T15:37`         | [Image](unavailable-1920.jpg)    | [Image](unavailable-1280.jpg)    |

The initial renders exposed a wrapped arrival heading, a footer overlap and
compressed destination names in rows with a via line. The updated layout reserves
space for the footer, keeps headings on one line per language and sizes the name
against the row's remaining height. Long via and English lines can use ellipsis.
Very long Sinhala names can use a one-line ellipsis in dense views when the
other information would otherwise overlap. Development logs flag truncated
Sinhala place names. Native Sinhala and physical viewing-distance checks remain
open.

## Sinhala copy for owner review

| Context                         | Text                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Title and columns               | බස් කාලසටහන · ගමනාරම්භය · ගමනාන්තය · පැමිණෙන වේලාව · පිටත්වන වේලාව · බස් සේවා වර්ගය · හරහා · වේදිකාව |
| Status and footer               | පිටත් විය · හෙට · පිටුව · අවසන් වරට තහවුරු කළේ · වේලාව සකසමින්... · කාලසටහන නොමැත · දුරකථනයෙන් බලන්න |
| Service types                   | සාමාන්‍ය · අර්ධ සුඛෝපභෝගී · සුඛෝපභෝගී · අධිවේගී                                                      |
| Weekdays and time               | සඳුදා · අඟහරුවාදා · බදාදා · බ්‍රහස්පතින්දා · සිකුරාදා · සෙනසුරාදා · ඉරිදා · පෙ.ව. · ප.ව.             |
| New loading and empty text      | කාලසටහන පූරණය වෙමින් පවතී · නියමිත බස් ගමන් නොමැත                                                    |
| Fallback and QR accessible name | ඊළඟ පිටත්වීම් පෙන්වයි · දුරකථනයෙන් කාලසටහන බලන්න                                                     |
| Credits                         | නිර්මාණය: &lt;team name&gt;                                                                          |
| Development alert               | අද පිටත්වීම් වෙනස් විය හැක. කරුණාකර කාර්ය මණ්ඩලයෙන් විමසන්න.                                         |

Review the published station, destination, origin, via and alert text as well.
The mock places deliberately use English in both fields.
