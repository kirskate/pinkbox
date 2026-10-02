import { DEFAULT_BPM, PATTERNS } from "./patterns.js";
import {
  bootAudio,
  cycleKey,
  getBpm,
  getKey,
  getPitch,
  getScale,
  isPadActive,
  isPadPending,
  isPlaying,
  resetAll,
  setBeatCallback,
  setBpm,
  setMasterVolume,
  setPitch,
  setScale,
  stop,
  togglePad,
  togglePlay,
} from "./audio.js";
import { bindUI, pulseBeat, renderApp, updatePad, updateReadout } from "./ui.js";

const root = document.querySelector("#app");
let volume = 80;

function refresh() {
  for (const pattern of PATTERNS) {
    updatePad(pattern.id, {
      active: isPadActive(pattern.id),
      pending: isPadPending(pattern.id),
    });
  }

  updateReadout({
    playing: isPlaying(),
    bpm: getBpm(),
    key: getKey(),
    scale: getScale(),
    pitch: getPitch(),
    volume,
  });
}

renderApp(root);

bindUI({
  async onPlay() {
    await togglePlay();
    refresh();
  },
  onStop() {
    stop();
    refresh();
  },
  onReset() {
    volume = 80;
    resetAll();
    refresh();
  },
  onBpm(delta) {
    setBpm(getBpm() + delta);
    refresh();
  },
  onBpmSet(value) {
    setBpm(value);
    refresh();
  },
  onPitch(value) {
    setPitch(value);
    refresh();
  },
  onVolume(value) {
    volume = value;
    setMasterVolume(value);
    refresh();
  },
  onKey(step) {
    cycleKey(step);
    refresh();
  },
  onScale(id) {
    setScale(id);
    refresh();
  },
  onPad(id) {
    togglePad(id);
    refresh();
  },
});

setBeatCallback(() => {
  pulseBeat(true);
  refresh();
  window.setTimeout(() => pulseBeat(false), 90);
});

setBpm(DEFAULT_BPM);
setMasterVolume(volume);
refresh();

bootAudio()
  .then(() => {
    document.body.classList.add("ready");
    refresh();
  })
  .catch((error) => {
    console.error("Audio failed to start", error);
    refresh();
  });
