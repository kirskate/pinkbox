# Pinkbox

A browser groovebox for performing without playing individual notes. KEYS, SYNTH, BASS and ARP generate compatible phrases in one C minor world. Real Tone.js synthesizers provide the sound; the old WAV files are not used by this version.

## Run

Requires Bun 1.4 or later.

```sh
bun install --frozen-lockfile
bun run dev
```

Open the address printed by the server. Audio starts only after PLAY. No external fonts or audio downloads are required.

## Perform

1. PLAY starts live KEYS. Select a role by its large name. LIVE enables/disables its generated performance on the next bar; LOOP independently enables/disables its saved phrase.
2. Turn **LIVE KEYS · АККОРД → НОТЫ** to move from a full chord to separate notes: quarters, eighths, sixteenths. Drag the dial vertically, use the range, or use the arrow keys on the range. The instrument plays the rhythm for you.
3. REC captures the selected role from the next bar for **four bars** (8 seconds at 120 BPM, after the wait). REC enables LIVE if needed. Switching LIVE off during capture lets the four-bar recording finish. STOP cancels it immediately.
4. On successful capture, LOOP starts automatically and LIVE switches off. Turn LIVE back on to play over the saved loop. Turning LIVE off again leaves the loop playing. Motion changes affect live KEYS, not saved notes.
5. Select BASS, ARP or SYNTH to add or record another role. FILTER changes both live and loop timbre of the selected role; VOL affects the whole mix. BPM changes on a bar boundary, keeping pitch and musical length.
6. REC again records a new live candidate while the old loop remains independent (mute LOOP if desired). Successful completion replaces that role's slot; STOP/error preserves it. One saved phrase per role.
7. Mute LIVE/LOOP layers to end the performance, then STOP. PLAY restarts selected sources from the beginning. Saved phrases last until page reload; REC stores notes and rhythm, not a downloadable audio file.

The instrument stops safely when its tab is hidden or audio is interrupted. Press PLAY to resume from the beginning. Background performance is not supported.

## Verify

```sh
bun test
bun run check
bun run build
# With the dev server running and Chromium installed:
bun run test:recording
bun run test:browser
bun run test:accessibility
bun run test:audio
bun run test:performance
bun run test:stress
```

Browser tests use `/usr/bin/chromium` by default; set `CHROMIUM_PATH` for another installed Chromium binary, and `PINKBOX_URL` for another server address. Stress runs for 300 seconds; `STRESS_SECONDS` overrides it for troubleshooting. Reports and screenshots are written to `/tmp/pinkbox-validation`. The performance test also captures a WAV for listening; PCM export is a test artifact, not a product feature. Run these tests in a trusted local environment: their Chromium launcher uses `--no-sandbox` for the cloud container.

`bun run build` produces a static page and browser bundle in `dist/`. The dev server retains the existing Tone browser bundle workaround. JavaScript has syntax, logic, browser and audio checks; a separate linter or TypeScript checker is not configured.

## Scope and status

See [SPEC](docs/SPEC.md), [architecture](docs/ARCHITECTURE.md) and [plan / verification](docs/PLAN.md). Pitch, key/scale changes, other effects, drums, a visualizer, project persistence and user audio export are deferred. Only desktop Chromium is verified; real MacBook/Safari/mobile audio and the author's subjective approval remain to be checked.

The original project is preserved in the published Git branch `legacy-pinkbox` at `422b9458e61d6b80286068e97bf3ccacbaf32ddb`. Development continues in `main`.
