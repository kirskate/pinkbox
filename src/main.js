import { AudioEngine } from "./audio.js";
import { createUI } from "./ui.js";
export const engine = new AudioEngine();
const unsubscribe = createUI(document.querySelector("#app"), engine);
// Background performance is not promised: stop safely, keep finished phrases.
const onVisibility = () => {
  if (document.hidden && ["running", "starting"].includes(engine.state.status))
    engine.stop(
      "Paused in background. Saved phrases kept; press PLAY to continue.",
    );
};
document.addEventListener("visibilitychange", onVisibility);
window.addEventListener("pagehide", (event) => {
  if (event.persisted) {
    // A cached page can return without re-running this module.
    engine.stop();
    return;
  }
  unsubscribe();
  document.removeEventListener("visibilitychange", onVisibility);
  engine.dispose();
});
