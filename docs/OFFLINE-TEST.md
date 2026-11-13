# Offline test on the TV box

Run this after the owner deploys the offline engine and publishes a timetable.

1. With Wi-Fi on, open [the deployed TV page](https://mahiyanganaya-bus.mahiyanganaya-bus.workers.dev/tv/) in Chrome on the box. Wait for the timetable, then open the TWA once online too. Use the same Chrome profile for subsequent tests.
2. Confirm the worker for scope `/tv/` is active in `chrome://serviceworker-internals`, or inspect the page with Chrome DevTools → Application → Service Workers. Check Cache Storage for a `bus-tv-*` cache and IndexedDB for `bus-display`.
3. Turn off Wi-Fi, fully close and reopen the TWA. The saved timetable should appear without Chrome’s “No internet” page. The shell may take up to three seconds to fall back.
4. Turn off the router. Unplug the box, plug it back in, and launch the TWA before the router comes back. Verify the saved timetable appears. With a reset clock, expect “Clock syncing...” and the unfiltered timetable.
5. Turn the router back on. Verify the timetable recovers, the clock shows Colombo time, and “Clock syncing...” clears without a manual refresh. The browser's online event triggers a retry; if the network stays connected while internet service returns, wait for the next poll.
6. Have the owner deploy a visible change. Leave the TV running and online. Verify it reloads once and shows the change within about 15 minutes, assuming it has not recently reloaded.
7. Optional: with a valid saved timetable older than 72 hours and a plausible clock, disconnect the box and verify the bilingual age warning. Check that the notice appears after 30 minutes without a successful fetch.
