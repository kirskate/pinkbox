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
          <div class="layer-bottom"><span class="saved-label" id="saved-${id}">LIVE</span><button class="layer-toggle" data-toggle="${id}" aria-label="Enable ${name} layer" aria-pressed="false">LIVE</button><button class="layer-toggle loop-toggle" data-loop="${id}" aria-label="Play saved ${name} loop" aria-pressed="false" disabled>LOOP</button></div>
        </article>`,
      ).join("")}</section>
      <section class="performance panel" aria-label="Selected layer controls">
        <div class="record-control"><span class="label">ЗАПИСЬ · <span id="selected-name">KEYS</span></span><button id="record" class="record">● REC</button><span id="record-status" class="micro">4 ТАКТА → ПОВТОР</span><progress id="record-progress" max="64" value="0" aria-label="Прогресс записи четырёх тактов"></progress></div>
        <div class="motion-control"><label class="label" for="motion">LIVE KEYS · АККОРД → НОТЫ</label><div class="motion-row"><button id="motion-dial" class="motion-dial" tabindex="-1" aria-hidden="true" title="Тяни вверх или вниз"><i></i></button><output id="motion-value" for="motion">АККОРД</output></div><input id="motion" type="range" min="0" max="100" value="0" aria-label="Разложение аккорда KEYS на ноты"></div>
        <label class="filter-control"><span class="control-heading"><span class="label">FILTER · <span id="filter-name">KEYS</span></span><output id="filter-value" for="filter">100%</output></span><input id="filter" type="range" min="0" max="100" step="1" value="100" aria-label="Selected layer filter"><span class="range-labels"><span>DARK</span><span>OPEN</span></span></label>
        <label class="volume-control"><span class="control-heading"><span class="label">MASTER VOL</span><output id="volume-value" for="volume">80%</output></span><input id="volume" type="range" min="0" max="100" step="1" value="80" aria-label="Master volume"><span class="range-labels"><span>0</span><span>100</span></span></label>
      </section>
      <p class="quick-guide">PLAY → крути KEYS → REC → дождись 4 тактов. LOOP повторяет запись; LIVE добавляет новую игру поверх.</p>
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
  root.querySelectorAll("[data-loop]").forEach(button => button.addEventListener("click", () => engine.toggleLoop(button.dataset.loop)));
  get("motion").addEventListener("input", event => engine.setMotion(event.target.value));
  let drag = null;
  get("motion-dial").addEventListener("pointerdown", event => {
    drag = { y: event.clientY, value: engine.state.motion };
    event.currentTarget.setPointerCapture(event.pointerId);
  });
  get("motion-dial").addEventListener("pointermove", event => {
    if (drag) engine.setMotion(drag.value + (drag.y - event.clientY));
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) get("motion-dial").addEventListener(type, () => { drag = null; });
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
    get("motion").value = state.motion;
    get("motion-dial").style.setProperty("--rotation", `${-135 + state.motion * 2.7}deg`);
    get("motion-value").textContent = state.motion === 0 ? "АККОРД" : state.motion < 34 ? "НОТЫ · 1/4" : state.motion < 67 ? "НОТЫ · 1/8" : "НОТЫ · 1/16";
    get("record").disabled = !running || Boolean(state.rec);
    get("record-progress").value = state.rec ? (state.rec.phase === "recording" ? Math.max(0, state.step - state.rec.start) : 0) : selected.saved ? 64 : 0;
    get("record").classList.toggle(
      "recording",
      state.rec?.phase === "recording",
    );
    get("record").textContent =
      state.rec?.phase === "armed"
        ? "◌ ЖДЁМ ТАКТ"
        : state.rec
          ? "● REC"
          : selected.saved
            ? "● ПЕРЕЗАПИСАТЬ"
            : "● REC";
    get("record-status").textContent = state.rec
      ? `${state.rec.target.toUpperCase()} · ${state.rec.phase === "armed" ? "ЖДЁМ ТАКТ" : state.rec.phase === "finalizing" ? "СОХРАНЕНИЕ" : `${Math.min(4, Math.floor((state.step - state.rec.start) / 16) + 1)} / 4 ТАКТА`}`
      : selected.saved ? `${state.selected.toUpperCase()} · ЗАПИСЬ СОХРАНЕНА` : "4 ТАКТА → ПОВТОР";
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
      panel.classList.toggle("active", running ? (track.active || track.loopActive) : (track.desired || track.loopDesired));
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
      toggle.textContent = track.desired ? "LIVE ●" : "LIVE ○";
      const loop = panel.querySelector("[data-loop]");
      loop.disabled = !track.saved;
      loop.textContent = track.loopPending !== null ? "LOOP …" : track.loopDesired ? "LOOP ●" : "LOOP ○";
      loop.setAttribute("aria-pressed", String(track.loopDesired));
      loop.setAttribute("aria-label", `${track.loopDesired ? "Mute" : "Play"} saved ${track.id.toUpperCase()} loop`);
      get(`state-${track.id}`).textContent =
        track.pending !== null
          ? track.desired
            ? "QUEUED ON"
            : "QUEUED OFF"
          : running && track.loopActive
            ? (track.active ? "LIVE + LOOP" : "LOOP PLAYING")
            : running && track.active
            ? "LIVE PLAYING"
            : track.desired
              ? "READY"
              : "OFF";
      get(`saved-${track.id}`).textContent =
        state.rec?.target === track.id
          ? state.rec.phase === "armed"
            ? "REC QUEUED"
            : "RECORDING"
          : track.saved
            ? "● 4 ТАКТА СОХРАНЕНЫ"
            : "LIVE";
      panel
        .querySelectorAll("[data-step]")
        .forEach((led) =>
          led.classList.toggle(
            "current",
            running &&
              (track.active || track.loopActive) &&
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
