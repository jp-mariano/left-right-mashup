import { state, el, MAX_TRACKS } from "../state.js";
import { setTrackValue, removeTrack } from "../audio/mixer.js";

export function updateStatus(message) {
  el.status.textContent = message;
}

export function updateConversionStatus(message) {
  el.conversionStatus.textContent = message;
}

export function panAriaValueText(pan) {
  if (pan <= -0.95) return "full left";
  if (pan >= 0.95) return "full right";
  if (Math.abs(pan) < 0.05) return "center";
  if (pan < 0) return `${Math.round(Math.abs(pan) * 100)} percent left of center`;
  return `${Math.round(pan * 100)} percent right of center`;
}

export function refreshControls() {
  const hasTracks = state.tracks.length > 0;
  const isRecording = state.recorder?.state === "recording";
  const atTrackLimit = state.tracks.length >= MAX_TRACKS;

  el.emptyState.style.display = hasTracks ? "none" : "block";
  el.playBtn.disabled = !hasTracks || state.isPlaying;
  el.stopBtn.disabled = !state.isPlaying && !isRecording;
  el.recordBtn.disabled = !hasTracks;
  el.downloadBtn.disabled = !state.recordingBlob;
  el.fileInput.disabled = atTrackLimit;
  el.addFilesLabel.dataset.disabled = atTrackLimit ? "true" : "false";
  el.addFilesText.textContent = atTrackLimit
    ? `Max ${MAX_TRACKS} Tracks Reached`
    : "Add Audio Files";
  el.addFilesLabel.title = atTrackLimit
    ? `Maximum of ${MAX_TRACKS} tracks. Remove a track to add another.`
    : `You can load up to ${MAX_TRACKS} tracks.`;

  el.recordBtn.textContent = isRecording ? "Stop Recording" : "Start Recording";
  el.recordBtn.setAttribute(
    "aria-label",
    isRecording
      ? "Stop recording and stop playback"
      : "Start recording the mixed output. Playback starts if it is not already playing.",
  );
  el.fileInput.setAttribute("aria-disabled", atTrackLimit ? "true" : "false");
  el.fileInput.setAttribute(
    "aria-label",
    atTrackLimit
      ? "Track limit reached. Remove a track to add more audio files."
      : "Add audio files from your device. Maximum two tracks.",
  );
}

export function renderTracks() {
  el.tracks.innerHTML = "";

  state.tracks.forEach((track) => {
    const trackEl = document.createElement("article");
    trackEl.className = "track";
    trackEl.setAttribute("role", "group");
    const volId = `track-${track.id}-volume`;
    const panId = `track-${track.id}-pan`;
    trackEl.innerHTML = `
      <div class="track-top">
        <strong class="track-title"></strong>
        <button type="button" data-action="remove" class="btn-remove">Remove</button>
      </div>
      <div class="track-row">
        <label class="track-slider-label" for="${volId}">
          Volume<span class="sr-only track-name-suffix"></span>
        </label>
        <input id="${volId}" data-action="volume" type="range" min="0" max="1.5" step="0.01" value="${track.volume}" />
        <span data-role="volume-value" aria-hidden="true">${Math.round(track.volume * 100)}%</span>
      </div>
      <div class="track-row">
        <label class="track-slider-label" for="${panId}">
          Pan<span class="sr-only track-name-suffix"></span>
        </label>
        <input
          id="${panId}"
          data-action="pan"
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value="${track.pan}"
          aria-describedby="track-${track.id}-pan-hint"
        />
        <span id="track-${track.id}-pan-hint" class="sr-only">
          Stereo position from left speaker through center to right speaker.
        </span>
        <span data-role="pan-value" aria-hidden="true">${track.pan.toFixed(2)}</span>
      </div>
      <div class="track-actions" role="group" aria-label="Pan presets and mute or solo">
        <button type="button" data-action="left" class="btn-pan">L</button>
        <button type="button" data-action="center" class="btn-pan">C</button>
        <button type="button" data-action="right" class="btn-pan">R</button>
        <button type="button" data-action="mute" class="btn-mute ${track.muted ? "active" : ""}" aria-pressed="${track.muted}">Mute</button>
        <button type="button" data-action="solo" class="btn-solo ${track.solo ? "active" : ""}" aria-pressed="${track.solo}">Solo</button>
      </div>
    `;

    const titleEl = trackEl.querySelector(".track-title");
    titleEl.textContent = track.name;
    titleEl.title = track.name;
    trackEl.setAttribute("aria-label", `Track: ${track.name}`);

    trackEl.querySelectorAll(".track-name-suffix").forEach((node) => {
      node.textContent = `, ${track.name}`;
    });

    const removeBtn = trackEl.querySelector('[data-action="remove"]');
    removeBtn.setAttribute("aria-label", `Remove ${track.name} from the mix`);

    const volInput = trackEl.querySelector('[data-action="volume"]');
    volInput.setAttribute("aria-valuetext", `${Math.round(track.volume * 100)} percent`);

    const panInput = trackEl.querySelector('[data-action="pan"]');
    panInput.setAttribute("aria-valuetext", panAriaValueText(track.pan));

    trackEl.querySelector('[data-action="left"]').setAttribute("aria-label", `Pan ${track.name} full left`);
    trackEl.querySelector('[data-action="center"]').setAttribute("aria-label", `Pan ${track.name} to center`);
    trackEl.querySelector('[data-action="right"]').setAttribute("aria-label", `Pan ${track.name} full right`);

    const muteBtn = trackEl.querySelector('[data-action="mute"]');
    muteBtn.setAttribute("aria-label", track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`);

    const soloBtn = trackEl.querySelector('[data-action="solo"]');
    soloBtn.setAttribute(
      "aria-label",
      track.solo ? `Turn off solo for ${track.name}` : `Solo ${track.name} (only this track will be heard)`,
    );

    trackEl.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;

      if (target.dataset.action === "volume") {
        setTrackValue(track.id, "volume", Number(target.value));
        const volumeValue = trackEl.querySelector('[data-role="volume-value"]');
        if (volumeValue) {
          volumeValue.textContent = `${Math.round(track.volume * 100)}%`;
        }
        target.setAttribute("aria-valuetext", `${Math.round(track.volume * 100)} percent`);
      }
      if (target.dataset.action === "pan") {
        setTrackValue(track.id, "pan", Number(target.value));
        const panValue = trackEl.querySelector('[data-role="pan-value"]');
        if (panValue) {
          panValue.textContent = track.pan.toFixed(2);
        }
        target.setAttribute("aria-valuetext", panAriaValueText(track.pan));
      }
    });

    trackEl.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;

      const action = target.dataset.action;
      if (action === "remove") {
        const wasLastTrack = state.tracks.length === 1;
        const wasPlaying   = state.isPlaying;
        const wasRecording = state.recorder?.state === "recording";

        removeTrack(track.id);

        if (wasLastTrack) {
          if (wasRecording) {
            state.recorder.stop();
          } else if (wasPlaying) {
            updateStatus("Stopped");
          }
        }

        renderTracks();
        refreshControls();
      }
      if (action === "left") setTrackValue(track.id, "pan", -1);
      if (action === "center") setTrackValue(track.id, "pan", 0);
      if (action === "right") setTrackValue(track.id, "pan", 1);
      if (action === "mute") setTrackValue(track.id, "muted", !track.muted);
      if (action === "solo") setTrackValue(track.id, "solo", !track.solo);
      if (action !== "remove") {
        renderTracks();
      }
    });

    el.tracks.append(trackEl);
  });
}
