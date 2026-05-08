import "./style.css";
import { state, el, MAX_TRACKS } from "./state.js";
import { initPersistence, getPersistedProject, saveProjectToStorage } from "./persistence.js";
import { ensureAudio, addAudioFile } from "./audio/mixer.js";
import { startPlayback, stopPlayback } from "./audio/transport.js";
import { startRecording, stopRecording, downloadRecording } from "./audio/recording.js";
import { convertWebmFileToWav, convertFileToFlac } from "./audio/conversion.js";
import { updateStatus, updateConversionStatus, refreshControls, renderTracks } from "./ui/render.js";

// ── HTML shell ──────────────────────────────────────────────────────────────
document.querySelector("#app").innerHTML = `
  <main class="app">
    <header class="header">
      <h1>Left Right Mashup</h1>
      <p>Mix sounds in your browser with per-track stereo panning.</p>
    </header>

    <section class="panel controls" aria-labelledby="transport-heading">
      <h2 id="transport-heading" class="sr-only">Playback, recording, and master volume</h2>
      <div class="row" role="group" aria-label="Transport and file import">
        <label id="add-files-label" class="button" title="You can load up to 2 tracks.">
          <span id="add-files-text" aria-hidden="true">Add Audio Files</span>
          <input
            id="file-input"
            type="file"
            accept="audio/*"
            multiple
            aria-label="Add audio files from your device. Maximum two tracks."
          />
        </label>
        <button id="play-btn" type="button" disabled aria-label="Play all loaded tracks">Play</button>
        <button id="stop-btn" type="button" disabled aria-label="Stop playback and any active recording">Stop</button>
        <button id="record-btn" type="button" disabled aria-label="Start recording the mixed output">Start Recording</button>
        <button id="download-btn" type="button" disabled aria-label="Download the last recording as a WebM file">Download Recording</button>
      </div>
      <div class="row">
        <label for="master-volume">Master volume</label>
        <input
          id="master-volume"
          type="range"
          min="0"
          max="1.5"
          step="0.01"
          value="1"
          aria-describedby="master-volume-value"
        />
        <span id="master-volume-value">100%</span>
      </div>
      <p id="status" role="status" aria-live="polite" aria-atomic="true">Load audio files to begin.</p>
    </section>

    <section class="panel" aria-labelledby="tracks-heading">
      <h2 id="tracks-heading">Tracks</h2>
      <div id="tracks" class="tracks"></div>
      <p id="empty-state">No tracks loaded yet.</p>
    </section>

    <section class="panel" aria-labelledby="convert-heading">
      <h2 id="convert-heading">Convert Audio Files</h2>
      <p class="convert-hint">
        Convert files locally in your browser: WebM to WAV, plus WebM or WAV to FLAC.
      </p>
      <div class="row" role="group" aria-label="WebM to WAV file conversion">
        <label id="convert-webm-label" class="button" title="Select a WebM audio file from your device">
          <span id="convert-webm-text" aria-hidden="true">WebM to WAV</span>
          <input
            id="convert-webm-input"
            type="file"
            accept="audio/webm,video/webm,.webm"
            aria-label="Choose a WebM file to convert to WAV"
          />
        </label>
      </div>
      <div class="row" role="group" aria-label="WebM or WAV to FLAC conversion">
        <label id="convert-flac-label" class="button" title="Select a WebM or WAV audio file from your device">
          <span id="convert-flac-text" aria-hidden="true">WebM or WAV to FLAC</span>
          <input
            id="convert-flac-input"
            type="file"
            accept="audio/webm,video/webm,audio/wav,audio/wave,.webm,.wav"
            aria-label="Choose a WebM or WAV file to convert to FLAC"
          />
        </label>
      </div>
      <p id="conversion-status" class="convert-status" role="status" aria-live="polite" aria-atomic="true"></p>
    </section>
  </main>
`;

// ── Element registry ─────────────────────────────────────────────────────────
// Populated here after HTML injection; all modules share the same el reference.
el.addFilesLabel = document.querySelector("#add-files-label");
el.addFilesText = document.querySelector("#add-files-text");
el.fileInput = document.querySelector("#file-input");
el.playBtn = document.querySelector("#play-btn");
el.stopBtn = document.querySelector("#stop-btn");
el.recordBtn = document.querySelector("#record-btn");
el.downloadBtn = document.querySelector("#download-btn");
el.masterVolume = document.querySelector("#master-volume");
el.masterVolumeValue = document.querySelector("#master-volume-value");
el.status = document.querySelector("#status");
el.tracks = document.querySelector("#tracks");
el.emptyState = document.querySelector("#empty-state");
el.convertWebmLabel = document.querySelector("#convert-webm-label");
el.convertWebmInput = document.querySelector("#convert-webm-input");
el.convertFlacLabel = document.querySelector("#convert-flac-label");
el.convertFlacInput = document.querySelector("#convert-flac-input");
el.conversionStatus = document.querySelector("#conversion-status");

// ── Bootstrap ────────────────────────────────────────────────────────────────
initPersistence(updateStatus);

const persistedProject = getPersistedProject();
if (persistedProject) {
  el.masterVolume.value = String(persistedProject.masterVolume);
  el.masterVolumeValue.textContent = `${Math.round(persistedProject.masterVolume * 100)}%`;
  el.masterVolume.setAttribute(
    "aria-valuetext",
    `${Math.round(persistedProject.masterVolume * 100)} percent`,
  );
  if (persistedProject.tracks.length > 0) {
    updateStatus(
      `Restored settings for ${persistedProject.tracks.length} track(s). Re-upload files with matching names to apply them.`,
    );
  }
}

updateConversionStatus("Choose a WebM file to convert.");
refreshControls();

// ── Event listeners ──────────────────────────────────────────────────────────
el.fileInput.addEventListener("change", async (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.files?.length) return;

  const availableSlots = Math.max(0, MAX_TRACKS - state.tracks.length);
  const files = [...input.files].slice(0, availableSlots);

  if (files.length < input.files.length) {
    updateStatus(`Only ${MAX_TRACKS} tracks are supported. Extra file(s) were skipped.`);
  }

  for (const file of files) {
    const result = await addAudioFile(file);
    if (result.success) {
      updateStatus(`Loaded ${result.name}`);
    } else {
      updateStatus(`Could not load "${result.name}". Please try another audio file.`);
    }
  }

  renderTracks();
  refreshControls();
  input.value = "";
});

el.playBtn.addEventListener("click", async () => {
  await ensureAudio();
  startPlayback();
  updateStatus("Playing");
});

el.stopBtn.addEventListener("click", () => {
  if (state.recorder?.state === "recording") stopRecording();
  if (state.isPlaying) stopPlayback();
  updateStatus("Stopped");
});

el.recordBtn.addEventListener("click", async () => {
  await ensureAudio();

  if (state.recorder?.state === "recording") {
    if (state.recorder?.state === "recording") stopRecording();
    if (state.isPlaying) stopPlayback();
    updateStatus("Stopped");
    return;
  }

  if (!state.isPlaying) {
    startPlayback();
  }
  startRecording();
});

el.downloadBtn.addEventListener("click", () => {
  downloadRecording();
});

el.convertWebmInput.addEventListener("change", async (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.files?.length) return;
  const [file] = input.files;
  await convertWebmFileToWav(file);
});

el.convertFlacInput.addEventListener("change", async (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.files?.length) return;
  const [file] = input.files;
  await convertFileToFlac(file);
});

el.masterVolume.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const value = Number(target.value);

  el.masterVolumeValue.textContent = `${Math.round(value * 100)}%`;
  target.setAttribute("aria-valuetext", `${Math.round(value * 100)} percent`);
  if (state.masterGain) {
    state.masterGain.gain.value = value;
  }
  saveProjectToStorage();
});
