import { ROLES } from "./patterns.js";
export function createUI(root, engine) {
  root.innerHTML = `
    <main class="machine" aria-label="Pinkbox musical instrument">
      <header class="masthead"><div><span class="eyebrow">GENERATIVE PERFORMANCE INSTRUMENT</span><h1>PINKBOX<span class="star" aria-hidden="true">✳</span></h1></div><span class="world">C MINOR<br>4/4 · FOUR BAR LOOPS</span></header>
      <section class="transport panel" aria-label="Playback">
        <div class="transport-buttons"><button id="play" class="play">▶ PLAY</button><button id="stop" class="stop">■ STOP</button></div>
        <div class="clock"><span class="label">TRANSPORT</span><div class="beat-leds" aria-hidden="true">${[0, 1, 2, 3].map((i) => `<i data-beat="${i}"></i>`).join("")}</div><output id="position">01 : 01</output></div>
        <label class="tempo"><span class="label">BPM</span><span class="tempo-input"><button id="bpm-minus" aria-label="Decrease tempo">−</button><input id="bpm" type="number" min="60" max="160" step="1" value="120" aria-label="Tempo in BPM"><button id="bpm-plus" aria-label="Increase tempo">+</button></span><span id="tempo-pending" class="micro"></span></label>
      </section>
      <section class="layers" aria-label="Musical layers">${ROLES.map(
        ({ id, name, character, color }, index) => `
        <article class="layer" data-role="${id}" style="--track-color:${color}">
          <div class="layer-top"><span class="number">0${index + 1}</span><span class="track-state" id="state-${id}">OFF</span></div>
          <button class="select-track" data-select="${id}" aria-label="Select ${name}" aria-pressed="false"><span class="track-name">${name}</span><span class="character">${character}</span><span class="selection-mark" aria-hidden="true">↓</span></button>
          <div class="phrase-strip" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => `<i data-step="${i}"></i>`).join("")}</div>
          <div class="layer-bottom"><span class="saved-label" id="saved-${id}">LIVE</span><button class="layer-toggle" data-toggle="${id}" aria-label="Enable ${name} layer" aria-pressed="false">+ ADD</button></div>
        </article>`,
      ).join("")}</section>
      <section class="performance panel" aria-label="Selected layer controls">
        <div class="record-control"><span class="label">PHRASE MEMORY · <span id="selected-name">KEYS</span></span><button id="record" class="record">● REC</button><span id="record-status" class="micro">4 BARS · NOTES + RHYTHM</span></div>
        <label class="filter-control"><span class="control-heading"><span class="label">FILTER · <span id="filter-name">KEYS</span></span><output id="filter-value" for="filter">100%</output></span><input id="filter" type="range" min="0" max="100" step="1" value="100" aria-label="Selected layer filter"><span class="range-labels"><span>DARK</span><span>OPEN</span></span></label>
        <label class="volume-control"><span class="control-heading"><span class="label">MASTER VOL</span><output id="volume-value" for="volume">80%</output></span><input id="volume" type="range" min="0" max="100" step="1" value="80" aria-label="Master volume"><span class="range-labels"><span>0</span><span>100</span></span></label>
      </section>
      <footer><span id="status" role="status" aria-live="polite">READY — PRESS PLAY</span><span class="footer-mark" aria-hidden="true">MAKE IT MOVE ↗</span></footer>
      <p id="error" role="alert" hidden></p>
    </main>`;
  const get = (id) => root.querySelector(`#${id}`);
  get("play").addEventListener("click", () => engine.play());
  get("stop").addEventListener("click", () => engine.stop());
  get("record").addEventListener("click", () => engine.record());
  get("bpm").addEventListener("change", (event) => {
    engine.setBpm(event.target.value);
    event.target.value = engine.state.pendingBpm?.value ?? engine.state.bpm;
  });
  get("bpm-minus").addEventListener("click", () =>
    engine.setBpm((engine.state.pendingBpm?.value ?? engine.state.bpm) - 1),
  );
  get("bpm-plus").addEventListener("click", () =>
    engine.setBpm((engine.state.pendingBpm?.value ?? engine.state.bpm) + 1),
  );
  get("filter").addEventListener("input", (event) =>
    engine.setFilter(event.target.value),
  );
  get("volume").addEventListener("input", (event) =>
    engine.setVolume(event.target.value),
  );
  root
    .querySelectorAll("[data-select]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        engine.select(button.dataset.select),
      ),
    );
  root
    .querySelectorAll("[data-toggle]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        engine.toggle(button.dataset.toggle),
      ),
    );
  let lastStatus = "";
  return engine.subscribe((state) => {
    const running = state.status === "running";
    get("play").disabled = running || state.status === "starting";
    get("play").textContent =
      state.status === "starting"
        ? "… STARTING"
        : running
          ? "▶ PLAYING"
          : "▶ PLAY";
    get("stop").disabled = state.status === "stopped";
    if (document.activeElement !== get("bpm"))
      get("bpm").value = state.pendingBpm?.value ?? state.bpm;
    get("tempo-pending").textContent = state.pendingBpm
      ? `NEXT BAR · ${state.bpm} → ${state.pendingBpm.value}`
      : "";
    const selected = state.tracks.find((track) => track.id === state.selected);
    get("selected-name").textContent = state.selected.toUpperCase();
    get("filter-name").textContent = state.selected.toUpperCase();
    get("filter").setAttribute(
      "aria-label",
      `Filter for ${state.selected.toUpperCase()}`,
    );
    get("filter").value = selected.filter;
    get("filter-value").textContent = `${selected.filter}%`;
    get("volume").value = state.volume;
    get("volume-value").textContent = `${state.volume}%`;
    get("record").disabled =
      !running || !selected.active || !selected.desired || Boolean(state.rec);
    get("record").classList.toggle(
      "recording",
      state.rec?.phase === "recording",
    );
    get("record").textContent =
      state.rec?.phase === "armed"
        ? "◌ WAIT"
        : state.rec
          ? "● REC"
          : selected.saved
            ? "● REPLACE"
            : "● REC";
    get("record-status").textContent = state.rec
      ? `${state.rec.target.toUpperCase()} · ${state.rec.phase === "armed" ? "NEXT BAR" : state.rec.phase === "finalizing" ? "SAVING" : `${Math.min(4, Math.floor((state.step - state.rec.start) / 16) + 1)} / 4 BARS`}`
      : "4 BARS · NOTES + RHYTHM";
    const beat =
      running && state.step >= 0 ? Math.floor(state.step / 4) % 4 : -1;
    root
      .querySelectorAll("[data-beat]")
      .forEach((led) =>
        led.classList.toggle("lit", Number(led.dataset.beat) === beat),
      );
    get("position").textContent =
      running && state.step >= 0
        ? `${String((Math.floor(state.step / 16) % 4) + 1).padStart(2, "0")} : ${String(beat + 1).padStart(2, "0")}`
        : "01 : 01";
    for (const track of state.tracks) {
      const panel = root.querySelector(`[data-role="${track.id}"]`);
      panel.classList.toggle("selected", track.id === state.selected);
      panel.classList.toggle("active", running ? track.active : track.desired);
      panel.classList.toggle("pending", track.pending !== null);
      panel
        .querySelector("[data-select]")
        .setAttribute("aria-pressed", String(track.id === state.selected));
      const toggle = panel.querySelector("[data-toggle]");
      toggle.setAttribute("aria-pressed", String(track.desired));
      toggle.setAttribute(
        "aria-label",
        `${track.desired ? "Disable" : "Enable"} ${track.id.toUpperCase()} layer`,
      );
      toggle.textContent = track.desired ? "− REMOVE" : "+ ADD";
      get(`state-${track.id}`).textContent =
        track.pending !== null
          ? track.desired
            ? "QUEUED ON"
            : "QUEUED OFF"
          : running && track.active
            ? "PLAYING"
            : track.desired
              ? "READY"
              : "OFF";
      get(`saved-${track.id}`).textContent =
        state.rec?.target === track.id
          ? state.rec.phase === "armed"
            ? "REC QUEUED"
            : "RECORDING"
          : track.saved
            ? "● SAVED LOOP"
            : "LIVE";
      panel
        .querySelectorAll("[data-step]")
        .forEach((led) =>
          led.classList.toggle(
            "current",
            running &&
              track.active &&
              Number(led.dataset.step) === state.step % 16,
          ),
        );
    }
    const status =
      state.status === "error"
        ? "AUDIO INTERRUPTED — PRESS PLAY"
        : state.status === "starting"
          ? "ENABLING AUDIO…"
          : running
            ? "RUNNING · LAYERS CHANGE ON THE BAR"
            : "READY — PRESS PLAY";
    if (status !== lastStatus) {
      get("status").textContent = status;
      lastStatus = status;
    }
    get("error").hidden = !state.error;
    get("error").textContent = state.error;
  });
}
