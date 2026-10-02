import {
  CATEGORIES,
  MAX_BPM,
  MIN_BPM,
  PATTERNS,
  SCALES,
} from "./patterns.js";

function el(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

export function renderApp(root) {
  root.innerHTML = "";
  root.append(buildShell());
}

function buildShell() {
  return el(`
    <div class="machine">
      <header class="top-bar">
        <div class="brand">
          <span class="power-led" id="power-led"></span>
          <h1>PINKBOX</h1>
          <span class="model">PB-16</span>
        </div>
        <div class="transport">
          <button class="hw-btn play" id="btn-play" type="button" aria-label="Play">PLAY</button>
          <button class="hw-btn stop" id="btn-stop" type="button" aria-label="Stop">STOP</button>
          <button class="hw-btn ghost" id="btn-reset" type="button" aria-label="Reset">RESET</button>
        </div>
        <div class="tempo">
          <span class="label">BPM</span>
          <button class="hw-btn mini" id="bpm-minus" type="button" aria-label="BPM down">−</button>
          <div class="segment" id="bpm-value">120</div>
          <button class="hw-btn mini" id="bpm-plus" type="button" aria-label="BPM up">+</button>
          <input id="bpm-slider" type="range" min="${MIN_BPM}" max="${MAX_BPM}" value="120" aria-label="BPM" />
        </div>
        <div class="status-readout">
          <span class="led" id="beat-led"></span>
          <span id="status-line">STOP  C  MIN</span>
        </div>
      </header>

      <section class="pad-deck" aria-label="Patterns">
        ${CATEGORIES.map((category) => {
          const pads = PATTERNS.filter((pattern) => pattern.category === category.id);
          return `
            <div class="bank bank-${category.id}">
              <div class="bank-label">${category.label}</div>
              <div class="pads">
                ${pads
                  .map(
                    (pattern, index) => `
                  <button
                    class="pad color-${pattern.color}"
                    type="button"
                    data-pad="${pattern.id}"
                    aria-label="${pattern.name}"
                    aria-pressed="false"
                  >
                    <span class="pad-led"></span>
                    <span class="pad-num">${String(index + 1).padStart(2, "0")}</span>
                    <span class="pad-name">${pattern.name}</span>
                  </button>
                `,
                  )
                  .join("")}
              </div>
            </div>
          `;
        }).join("")}
      </section>

      <section class="controls" aria-label="Synth controls">
        <label class="control">
          <span class="label">PITCH</span>
          <input id="pitch" type="range" min="-12" max="12" value="0" aria-label="Pitch" />
          <span class="value" id="pitch-value">0</span>
        </label>
        <div class="control">
          <span class="label">KEY</span>
          <div class="key-row">
            <button class="hw-btn mini" id="key-prev" type="button" aria-label="Previous key">◀</button>
            <span class="value" id="key-value">C</span>
            <button class="hw-btn mini" id="key-next" type="button" aria-label="Next key">▶</button>
          </div>
        </div>
        <div class="control">
          <span class="label">SCALE</span>
          <div class="scale-row">
            ${Object.values(SCALES)
              .map(
                (scale, index) => `
              <button
                class="hw-btn scale-btn ${index === 1 ? "on" : ""}"
                type="button"
                data-scale="${scale.id}"
                aria-label="${scale.name}"
              >${scale.name}</button>
            `,
              )
              .join("")}
          </div>
        </div>
        <label class="control">
          <span class="label">VOL</span>
          <input id="volume" type="range" min="0" max="100" value="80" aria-label="Volume" />
          <span class="value" id="volume-value">80</span>
        </label>
      </section>
    </div>
  `);
}

export function bindUI(handlers) {
  const playBtn = document.querySelector("#btn-play");
  const stopBtn = document.querySelector("#btn-stop");
  const resetBtn = document.querySelector("#btn-reset");
  const bpmMinus = document.querySelector("#bpm-minus");
  const bpmPlus = document.querySelector("#bpm-plus");
  const bpmSlider = document.querySelector("#bpm-slider");
  const pitch = document.querySelector("#pitch");
  const volume = document.querySelector("#volume");

  playBtn.addEventListener("click", () => handlers.onPlay());
  stopBtn.addEventListener("click", () => handlers.onStop());
  resetBtn.addEventListener("click", () => handlers.onReset());
  bpmMinus.addEventListener("click", () => handlers.onBpm(-1));
  bpmPlus.addEventListener("click", () => handlers.onBpm(1));
  bpmSlider.addEventListener("input", (event) => handlers.onBpmSet(Number(event.target.value)));
  pitch.addEventListener("input", (event) => handlers.onPitch(Number(event.target.value)));
  volume.addEventListener("input", (event) => handlers.onVolume(Number(event.target.value)));

  document.querySelector("#key-prev").addEventListener("click", () => handlers.onKey(-1));
  document.querySelector("#key-next").addEventListener("click", () => handlers.onKey(1));

  document.querySelectorAll("[data-scale]").forEach((button) => {
    button.addEventListener("click", () => handlers.onScale(button.dataset.scale));
  });

  document.querySelectorAll("[data-pad]").forEach((button) => {
    button.addEventListener("click", () => handlers.onPad(button.dataset.pad));
  });
}

export function updatePad(id, { active, pending }) {
  const button = document.querySelector(`[data-pad="${id}"]`);
  if (!button) return;
  button.classList.toggle("is-on", active);
  button.classList.toggle("is-pending", pending);
  button.setAttribute("aria-pressed", active ? "true" : "false");
}

export function updateReadout({ playing, bpm, key, scale, pitch, volume }) {
  document.querySelector("#bpm-value").textContent = String(bpm);
  document.querySelector("#bpm-slider").value = String(bpm);
  document.querySelector("#pitch-value").textContent = pitch > 0 ? `+${pitch}` : String(pitch);
  document.querySelector("#pitch").value = String(pitch);
  document.querySelector("#key-value").textContent = key;
  document.querySelector("#volume-value").textContent = String(volume);
  document.querySelector("#volume").value = String(volume);
  document.querySelector("#status-line").textContent = `${playing ? "PLAY" : "STOP"}  ${key}  ${SCALES[scale].name}`;
  document.querySelector("#btn-play").textContent = playing ? "PAUSE" : "PLAY";
  document.querySelector("#btn-play").classList.toggle("is-live", playing);
  document.querySelector("#power-led").classList.toggle("on", playing);
  document.querySelectorAll("[data-scale]").forEach((button) => {
    button.classList.toggle("on", button.dataset.scale === scale);
  });
}

export function pulseBeat(on) {
  document.querySelector("#beat-led").classList.toggle("on", on);
}
