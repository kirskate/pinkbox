import {
  KEY_BINDINGS,
  NOTE_NAMES,
  TIMBRE_NAMES,
  chordNotes,
} from "./patterns.js";
const degrees = ["I", "II", "III", "IV", "V", "VI", "VII", "I↑"];
const knob = (id, title, max, labels) =>
  `<div class="knob-control"><label for="${id}" class="label">${title}</label><div class="knob-wrap"><button class="dial" data-dial="${id}" tabindex="-1" aria-hidden="true" title="Тяни вверх/вниз"><i></i></button><output id="${id}-value" for="${id}">${labels[0]}</output></div><input id="${id}" type="range" min="0" max="${max}" step="1" value="0" aria-label="${title}"></div>`;
export function createUI(root, engine) {
  root.innerHTML = `<main class="machine" aria-label="Pinkbox — клавиатурный инструмент и лупер">
    <header class="masthead"><div class="brand">PINKBOX<span aria-hidden="true">✳</span><small>CHORDS · ARP · FIVE LOOPS</small></div>
      <div class="transport"><button id="play" class="lime">▶ PLAY</button><button id="stop">■ STOP</button><label class="tempo">BPM<input id="bpm" type="number" min="60" max="160" value="120" aria-label="Темп BPM"></label><output id="position">01:01</output></div>
      <label class="master label">MASTER VOL<input id="volume" type="range" min="0" max="100" value="75" aria-label="Общая громкость"><output id="volume-value">75%</output></label>
    </header>
    <section class="top-panel" aria-label="Управление живым голосом">
      <section class="bass-module module"><div class="section-title">01 · BASS</div><div class="mode-buttons"><button data-mode="keys" aria-pressed="true">KEYS</button><button data-mode="bass" aria-pressed="false">BASS</button></div><button id="bass-link" class="small">LINK · клавиатура</button><div class="bass-pads"><button data-pad="0" aria-label="Басовый пэд первая ступень">I<small>ROOT</small></button><button data-pad="4" aria-label="Басовый пэд пятая ступень">V<small>FIFTH</small></button></div><span class="hint">Один живой голос</span></section>
      <section class="chord-module module"><div class="section-title">02 · CHORD BUILDER</div><div class="tonality"><label>KEY<select id="key" aria-label="Тональность">${NOTE_NAMES.map((name, i) => `<option value="${i}">${name}</option>`).join("")}</select></label><label>SCALE<select id="scale" aria-label="Гамма"><option value="minor">MINOR</option><option value="major">MAJOR</option></select></label></div>${knob("richness", "CHORD · состав", 2, ["TRIAD"])}<div class="display"><span id="chord-name">C MINOR</span><output id="chord-notes">УДЕРЖИВАЙ КЛАВИШУ</output><span id="voice-status">LIVE · KEYS</span></div></section>
      <section class="arp-module module"><div class="section-title">03 · ARPEGGIATOR</div>${knob("arp", "ARP · аккорд → ноты", 3, ["CHORD"])}<div class="directions">${[
        ["up", "↑ UP"],
        ["down", "↓ DOWN"],
        ["updown", "↕ UP/DOWN"],
      ]
        .map(
          ([id, name]) =>
            `<button data-direction="${id}" aria-pressed="${id === "up"}">${name}</button>`,
        )
        .join(
          "",
        )}</div><span class="hint">Заменяет аккорд · общий BPM</span></section>
      <section class="synth-module module"><div class="section-title">04 · SYNTH</div>${knob("timbre", "TONE · тембр", 2, ["SOFT"])}${knob("filter", "FILTER · яркость", 100, ["100%"])}<span class="hint">Меняет только живой голос</span></section>
    </section>
    <section class="lower-panel">
      <section class="keyboard-module module" aria-label="Клавиатура инструмента"><div class="section-title">KEYBOARD <span>Удерживай · отпусти · запиши</span></div><div class="keyboard">
        <div class="white-keys">${Object.entries(KEY_BINDINGS)
          .filter(([, p]) => !p.black)
          .map(
            ([code, p]) =>
              `<button class="piano-key white" data-key="${code}" aria-label="${degrees[p.degree]}, клавиша ${code.slice(3)}"><span class="degree">${degrees[p.degree]}</span><span class="note-label"></span><kbd>${code.slice(3)}</kbd></button>`,
          )
          .join("")}</div>
        ${Object.entries(KEY_BINDINGS)
          .filter(([, p]) => p.black)
          .map(
            ([code, p]) =>
              `<button class="piano-key black" data-key="${code}" style="--boundary:${p.degree + 1}" aria-label="Дополнительный мажорный аккорд, клавиша ${code.slice(3)}"><span class="note-label"></span><kbd>${code.slice(3)}</kbd></button>`,
          )
          .join("")}
      </div><p class="keyboard-help">A S D F G H J K · ступени гаммы<br>W E T Y U · дополнительные мажорные аккорды</p></section>
      <section class="loop-module module" aria-label="Пять записанных дорожек"><div class="loop-header"><div><span class="section-title">05 · LOOPER</span><span id="slot-count">0 / 5</span></div><button id="record" class="record">● REC · 4 ТАКТА</button></div><div class="rec-status"><span id="record-status" role="status" aria-live="polite">REC → четыре такта → новая дорожка</span><progress id="record-progress" max="64" value="0" aria-label="Прогресс записи"></progress></div>
        <div class="loop-slots">${Array.from({ length: 5 }, (_, i) => `<div class="loop-row" data-slot="${i}"><span class="slot-number">0${i + 1}</span><button data-loop="${i}" aria-label="Включить дорожку ${i + 1}" disabled>▶</button><span class="clip-name" id="clip-${i}">СВОБОДНО</span><label class="loop-volume"><input data-volume="${i}" type="range" min="0" max="100" value="75" aria-label="Громкость дорожки ${i + 1}" disabled><output id="vol-${i}">—</output></label><button data-delete="${i}" class="delete" aria-label="Удалить дорожку ${i + 1}" disabled>×</button></div>`).join("")}</div>
        <div class="loop-footer"><span>Записи живут до перезагрузки страницы</span><button id="reset" class="small">RESET ALL</button></div>
      </section>
    </section><footer><span id="status">READY · нажми и удерживай A</span><span id="tempo-pending"></span><span>MAKE IT MOVE ↗</span></footer><p id="error" role="alert" hidden></p>
  </main>`;
  const get = (id) => root.querySelector(`#${id}`);
  const cleanups = [];
  const listen = (target, type, fn) => {
    target.addEventListener(type, fn);
    cleanups.push(() => target.removeEventListener(type, fn));
  };
  listen(get("play"), "click", () => engine.play());
  listen(get("stop"), "click", () => engine.stop());
  listen(get("reset"), "click", () => engine.reset());
  listen(get("record"), "click", () => engine.record());
  listen(get("bpm"), "change", (event) => {
    engine.setBpm(event.target.value);
    event.target.value = engine.state.pendingBpm?.value ?? engine.state.bpm;
  });
  listen(get("key"), "change", (event) =>
    engine.edit("setKey", event.target.value),
  );
  listen(get("scale"), "change", (event) =>
    engine.edit("setScale", event.target.value),
  );
  listen(get("volume"), "input", (event) =>
    engine.setVolume(event.target.value),
  );
  const controls = {
    richness: ["setRichness", 2],
    arp: ["setArp", 3],
    timbre: ["setTimbre", 2],
    filter: [null, 100],
  };
  for (const [id, [method, max]] of Object.entries(controls)) {
    const set = (value) =>
      method ? engine.edit(method, value) : engine.setFilter(value);
    listen(get(id), "input", (event) => set(event.target.value));
    const dial = root.querySelector(`[data-dial="${id}"]`);
    let drag = null;
    listen(dial, "pointerdown", (event) => {
      drag = { y: event.clientY, value: engine.state[id] };
      dial.setPointerCapture(event.pointerId);
    });
    listen(dial, "pointermove", (event) => {
      if (drag) set(drag.value + ((drag.y - event.clientY) * max) / 100);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      listen(dial, type, () => {
        drag = null;
      });
  }
  root
    .querySelectorAll("[data-direction]")
    .forEach((button) =>
      listen(button, "click", () =>
        engine.edit("setDirection", button.dataset.direction),
      ),
    );
  root
    .querySelectorAll("[data-mode]")
    .forEach((button) =>
      listen(button, "click", () =>
        engine.edit("setMode", button.dataset.mode),
      ),
    );
  listen(get("bass-link"), "click", () => {
    engine.state.bassMode =
      engine.state.bassMode === "link" ? "manual" : "link";
    engine.edit("setMode", "bass");
  });
  const heldPointers = new Set();
  function pointerKey(button, position, pad = false) {
    listen(button, "pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      button.focus();
      button.setPointerCapture(event.pointerId);
      const id = `pointer:${event.pointerId}`;
      heldPointers.add(id);
      if (pad) {
        engine.state.bassMode = "manual";
        engine.edit("setMode", "bass");
      }
      engine.press(id, { ...position, pad });
    });
    const release = (event) => {
      const id = `pointer:${event.pointerId}`;
      heldPointers.delete(id);
      engine.releaseKey(id);
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      listen(button, type, release);
    listen(button, "keydown", (event) => {
      if (["Enter", "Space"].includes(event.code) && !event.repeat) {
        event.preventDefault();
        if (pad) {
          engine.state.bassMode = "manual";
          engine.edit("setMode", "bass");
        }
        engine.press(`button:${button.dataset.key ?? button.dataset.pad}`, {
          ...position,
          pad,
        });
      }
    });
    listen(button, "keyup", (event) => {
      if (["Enter", "Space"].includes(event.code)) {
        event.preventDefault();
        engine.releaseKey(`button:${button.dataset.key ?? button.dataset.pad}`);
      }
    });
  }
  root
    .querySelectorAll("[data-key]")
    .forEach((button) => pointerKey(button, KEY_BINDINGS[button.dataset.key]));
  root
    .querySelectorAll("[data-pad]")
    .forEach((button) =>
      pointerKey(
        button,
        { degree: Number(button.dataset.pad), black: false },
        true,
      ),
    );
  listen(window, "keydown", (event) => {
    const position = KEY_BINDINGS[event.code];
    if (
      !position ||
      event.repeat ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.target.closest("input[type=number],textarea,[contenteditable=true]")
    )
      return;
    event.preventDefault();
    engine.press(event.code, position);
  });
  listen(window, "keyup", (event) => {
    if (KEY_BINDINGS[event.code]) {
      engine.releaseKey(event.code);
    }
  });
  listen(window, "blur", () => {
    heldPointers.clear();
    engine.releaseKeys();
  });
  root
    .querySelectorAll("[data-loop]")
    .forEach((button) =>
      listen(button, "click", () =>
        engine.toggleSlot(Number(button.dataset.loop)),
      ),
    );
  root
    .querySelectorAll("[data-delete]")
    .forEach((button) =>
      listen(button, "click", () =>
        engine.deleteSlot(Number(button.dataset.delete)),
      ),
    );
  root
    .querySelectorAll("[data-volume]")
    .forEach((input) =>
      listen(input, "input", () =>
        engine.setSlotVolume(Number(input.dataset.volume), input.value),
      ),
    );
  let lastRecText = "";
  const unsubscribe = engine.subscribe((state) => {
    const running = state.status === "running";
    get("play").disabled = running || state.status === "starting";
    get("play").textContent =
      state.status === "starting" ? "… START" : "▶ PLAY";
    get("stop").disabled = state.status === "stopped";
    if (document.activeElement !== get("bpm"))
      get("bpm").value = state.pendingBpm?.value ?? state.bpm;
    get("key").value = state.tonic;
    get("scale").value = state.scale;
    const labels = {
      richness: ["TRIAD", "7TH", "9TH"],
      arp: ["CHORD", "1/4", "1/8", "1/16"],
      timbre: TIMBRE_NAMES,
    };
    for (const [id, [, max]] of Object.entries(controls)) {
      get(id).value = state[id];
      get(`${id}-value`).textContent =
        id === "filter" ? `${state.filter}%` : labels[id][state[id]];
      root
        .querySelector(`[data-dial="${id}"]`)
        .style.setProperty(
          "--rotation",
          `${-135 + (state[id] / max) * 270}deg`,
        );
    }
    get("volume").value = state.volume;
    get("volume-value").textContent = `${state.volume}%`;
    root
      .querySelectorAll("[data-direction]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(b.dataset.direction === state.direction),
        ),
      );
    root
      .querySelectorAll("[data-mode]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode)),
      );
    get("bass-link").textContent =
      state.bassMode === "link" ? "LINK · клавиатура" : "MANUAL · пэды";
    get("chord-name").textContent =
      `${NOTE_NAMES[state.tonic]} ${state.scale.toUpperCase()}`;
    get("chord-notes").textContent = state.notes.length
      ? state.notes.map((n) => NOTE_NAMES[n % 12]).join(" · ")
      : "УДЕРЖИВАЙ КЛАВИШУ";
    for (const id of ["richness", "arp", "timbre"]) {
      get(id).disabled = state.mode === "bass";
      root.querySelector(`[data-dial="${id}"]`).disabled =
        state.mode === "bass";
    }
    root.querySelectorAll("[data-direction]").forEach((button) => {
      button.disabled = state.mode === "bass";
    });
    get("voice-status").textContent =
      `LIVE · ${state.mode === "bass" ? "BASS" : state.arp ? "ARP" : "KEYS"} · ${state.mode === "bass" ? "LOW ROOT" : TIMBRE_NAMES[state.timbre]}`;
    root.querySelectorAll("[data-key]").forEach((b) => {
      const p = KEY_BINDINGS[b.dataset.key];
      b.classList.toggle(
        "held",
        state.held.some(
          (h) => !h.pad && h.degree === p.degree && h.black === p.black,
        ),
      );
      b.querySelector(".note-label").textContent =
        NOTE_NAMES[
          chordNotes(state.tonic, state.scale, p, state.richness)[0] % 12
        ];
    });
    const count = state.slots.filter(Boolean).length;
    get("slot-count").textContent = `${count} / 5`;
    get("record").disabled = !running || Boolean(state.rec) || count === 5;
    get("record").classList.toggle(
      "recording",
      state.rec?.phase === "recording",
    );
    get("record").textContent = state.rec
      ? state.rec.phase === "armed"
        ? "◌ ЖДЁМ ТАКТ"
        : "● ЗАПИСЬ"
      : count === 5
        ? "5 / 5 · ЗАНЯТО"
        : "● REC · 4 ТАКТА";
    const recText = state.rec
      ? state.rec.phase === "armed"
        ? `ДОРОЖКА ${state.rec.index + 1} · старт на такте`
        : `ДОРОЖКА ${state.rec.index + 1} · ${Math.min(4, Math.floor((state.step - state.rec.start) / 16) + 1)} / 4 ТАКТА`
      : count === 5
        ? "Удали дорожку, чтобы записать новую"
        : count
          ? "Запись повторяется · играй поверх"
          : "REC → четыре такта → новая дорожка";
    if (recText !== lastRecText) {
      get("record-status").textContent = recText;
      lastRecText = recText;
    }
    get("record-progress").value =
      state.rec?.phase === "recording"
        ? Math.max(0, state.step - state.rec.start)
        : 0;
    state.slots.forEach((slot, i) => {
      const row = root.querySelector(`[data-slot="${i}"]`);
      row.classList.toggle("filled", Boolean(slot));
      row.classList.toggle("playing", running && Boolean(slot?.active));
      const play = row.querySelector("[data-loop]");
      play.disabled = !slot;
      play.textContent =
        slot?.pending !== null && slot ? "…" : slot?.enabled ? "■" : "▶";
      play.setAttribute("aria-pressed", String(Boolean(slot?.enabled)));
      play.setAttribute(
        "aria-label",
        `${slot?.enabled ? "Выключить" : "Включить"} дорожку ${i + 1}`,
      );
      get(`clip-${i}`).textContent = slot
        ? `${slot.settings.timbre === "bass" ? "BASS" : TIMBRE_NAMES[slot.settings.timbre]} · 4 ТАКТА`
        : "СВОБОДНО";
      const range = row.querySelector("input");
      range.disabled = !slot;
      range.value = slot?.volume ?? 75;
      get(`vol-${i}`).textContent = slot ? `${slot.volume}%` : "—";
      row.querySelector("[data-delete]").disabled = !slot;
    });
    get("position").textContent =
      running && state.step >= 0
        ? `${String((Math.floor(state.step / 16) % 4) + 1).padStart(2, "0")}:${String((Math.floor(state.step / 4) % 4) + 1).padStart(2, "0")}`
        : "01:01";
    get("status").textContent =
      state.status === "error"
        ? "AUDIO ERROR · нажми PLAY"
        : running
          ? state.notes.length
            ? "LIVE · удерживаешь клавишу"
            : "RUNNING · играй клавишами A–K"
          : "READY · нажми и удерживай A";
    get("tempo-pending").textContent = state.pendingBpm
      ? `BPM ${state.pendingBpm.value} · со следующего такта`
      : "";
    get("error").hidden = !state.error;
    get("error").textContent = state.error;
  });
  return () => {
    unsubscribe();
    for (const cleanup of cleanups) cleanup();
  };
}
