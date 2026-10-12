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

1. PLAY starts KEYS. Select a layer by its large name; ADD/REMOVE changes its activity on the next available bar.
2. REC records the selected active layer from the next bar for four bars, then repeats its notes and rhythm. Other layers remain independent.
3. Add BASS, ARP and SYNTH; select each to adjust FILTER. Master VOL controls the whole mix. BPM changes on a bar boundary, keeping pitch and the recording's musical length.
4. REC again replaces that layer's phrase only after a successful recording. STOP or removing that layer cancels the candidate and keeps its previous saved phrase.
5. Remove layers to end the performance, then STOP. PLAY restarts chosen layers from the beginning. Saved phrases remain until the page is reloaded.

The instrument stops safely when its tab is hidden or audio is interrupted. Press PLAY to resume from the beginning. Background performance is not supported.

## Verify

```sh
bun test
bun run check
bun run build
# With the dev server running and Chromium installed:
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
