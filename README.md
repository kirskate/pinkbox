# Pinkbox

A pink keyboard instrument and four-track looper inspired by the reference hardware layout. One live voice becomes a diatonic chord, an arpeggio, or a bass note. SYNTH changes its sound; each saved loop keeps its own notes and sound.

## Run locally

Requires Bun 1.4+.

```sh
bun install --frozen-lockfile
bun run dev
```

Open the address printed by the server. If port 3000 is already occupied:

```sh
PORT=3001 bun run dev
```

To get the latest GitHub version, stop the old server with Ctrl+C, run `git pull --ff-only origin main`, install again, then restart. The browser needs a refresh.

The compact desktop layout is verified at 100% browser zoom, including 1502×640 and 1502×700. Extra instructional/repeated captions are removed; accessible control labels remain. Bass uses a louder warm harmonic waveform with a smoother attack.

## Play and record

1. Hold **A** or an on-screen white key. Audio starts from this gesture. A/S/D/F/G/H/J/K select scale degrees I–VII/I↑; letters are positions, not fixed pitches. W/E/T/Y/U select the extra major chords. Physical key positions also work with a Russian keyboard layout.
2. Change KEY/SCALE while holding: the live chord follows the new tonality. Existing loops keep their notes. CHORD selects TRIAD/7TH/9TH. White keys use the scale; black keys are always major triads rooted a semitone above the preceding white degree.
3. Turn **ARP** from CHORD to 1/4, 1/8 or 1/16; it replaces the held chord with its notes. Select UP/DOWN/UP-DOWN in the ARP ··· menu. Turn **TONE** for SOFT/GLASS/ANALOG/PLUCK/ORGAN/AIR, FILTER for live brightness. All sounds are real Tone.js synthesis, not missing sample-bank placeholders.
4. Press **REC**. It waits for the next available bar, then captures four bars: 8 seconds at 120 BPM, excluding the wait. It also captures a note held before the recording started. After four bars a new loop begins automatically. Your held key continues playing over it; release the key to hear the saved loop alone.
5. Play and REC another phrase over the loop. Each recording gets a new slot, with its sound/FILTER frozen at recording start. Four slots total; the live voice is separate. Each loop has its own play/mute, volume and delete. When all four are filled, delete one to enable REC again.
6. **BASS** changes the sole live voice to a held low root. LINK follows the keyboard; MANUAL uses the I/V pads. Pressing a pad enters manual bass. **KEYS** returns to chord/ARP playing. Bass and chords never form simultaneous independent live layers.
7. **STOP** stops sound and unfinished REC, keeping completed loops. **PLAY** restarts them from the beginning. **RESET ALL** stops and deletes all recordings. MASTER VOL adjusts everything.

Live key actions are quantized to a 1/16 grid in this version. Last held key wins; releasing it returns to an earlier held key. Recorded rhythm/notes follow what was played on this grid. Loops live only in this tab's memory: reload or close clears them. Changing tonality can intentionally clash with old loops. Backgrounding the page stops the performance safely; press PLAY to restart.

## Verify and build

```sh
bun test
bun run check
bun run build
# With dev server running and Chromium installed:
bun run test:browser
bun run test:accessibility
bun run test:sounds
bun run test:stress
```

`test:recording` is an alias for the full browser scenario. It records four real loops, checks actual audio, key hold/release, changed tonality, arp, bass/pads, saved timbres, track volume/mute/delete, STOP/reset, cleanup and viewport. Stress also records four actual loops before its default 60-second load; set `STRESS_SECONDS` for longer runs. Set `CHROMIUM_PATH` and `PINKBOX_URL` if needed. Reports/screenshots are in `/tmp/pinkbox-validation`.

`check` is a JavaScript syntax check; TypeScript and a linter are not configured. `build` produces static `dist/`, preserving the existing Tone browser bundle workaround. No external fonts or audio downloads are required. The `public/assets/audio` files belong to the original version and are not used.

See [SPEC](docs/SPEC.md), [ARCHITECTURE](docs/ARCHITECTURE.md), [PLAN](docs/PLAN.md). Only desktop Chromium/Linux is automatically verified; real MacBook/Safari/mobile audio and subjective sound/design approval remain open. Sample-bank blending, external MIDI/FX, persistence and audio export are deferred.

The original project remains in `legacy-pinkbox` at `422b9458e61d6b80286068e97bf3ccacbaf32ddb`. Previous groovebox revisions remain in Git history. Current development continues in `main`.

## Publish with GitHub Pages

The included `Publish Pinkbox` workflow builds and deploys `main` to GitHub Pages. A repository administrator must first open **Settings → Pages → Build and deployment → Source → GitHub Actions**. Then open **Actions → Publish Pinkbox → Run workflow**, select `main`, and start it (or re-run the initial publication after enabling Pages).

After the workflow completes successfully, the public address is **https://kirskate.github.io/pinkbox/**. Future pushes to `main` update the site automatically. The static build uses relative CSS/JS paths, so it works under `/pinkbox/`. Visitors do not need Bun or a local server; audio still requires a keyboard/button gesture, and their recordings are temporary in their own browser tab.

The GitHub API was unavailable from the development environment (`Forbidden`), so enabling Pages and verifying the first public deployment must be done in GitHub. The intended address is not proof that deployment has finished.
