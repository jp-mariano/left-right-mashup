import "./style.css";
import FlacModule from "libflacjs/dist/libflac.js";

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

const state = {
  audioContext: null,
  masterGain: null,
  recordingDestination: null,
  recorder: null,
  chunks: [],
  recordingBlob: null,
  tracks: [],
  playbackStartedAt: 0,
  isPlaying: false,
  nextTrackId: 1,
};

const MAX_TRACKS = 2;
const STORAGE_KEY = "left-and-right-mashup-project-v1";

const el = {
  addFilesLabel: document.querySelector("#add-files-label"),
  addFilesText: document.querySelector("#add-files-text"),
  fileInput: document.querySelector("#file-input"),
  playBtn: document.querySelector("#play-btn"),
  stopBtn: document.querySelector("#stop-btn"),
  recordBtn: document.querySelector("#record-btn"),
  downloadBtn: document.querySelector("#download-btn"),
  masterVolume: document.querySelector("#master-volume"),
  masterVolumeValue: document.querySelector("#master-volume-value"),
  status: document.querySelector("#status"),
  tracks: document.querySelector("#tracks"),
  emptyState: document.querySelector("#empty-state"),
  convertWebmLabel: document.querySelector("#convert-webm-label"),
  convertWebmInput: document.querySelector("#convert-webm-input"),
  convertFlacLabel: document.querySelector("#convert-flac-label"),
  convertFlacInput: document.querySelector("#convert-flac-input"),
  conversionStatus: document.querySelector("#conversion-status"),
};

const persistedProject = loadPersistedProject();

function updateStatus(message) {
  el.status.textContent = message;
}

function saveProjectToStorage() {
  const payload = {
    masterVolume: Number(el.masterVolume.value),
    tracks: state.tracks.map((track) => ({
      name: track.name,
      volume: track.volume,
      pan: track.pan,
      muted: track.muted,
      solo: track.solo,
    })),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadPersistedProject() {
  const rawValue = localStorage.getItem(STORAGE_KEY);
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Saved project is not an object.");
    }

    const tracks = Array.isArray(parsed.tracks) ? parsed.tracks : [];
    const cleanedTracks = tracks
      .filter((track) => track && typeof track.name === "string")
      .slice(0, MAX_TRACKS)
      .map((track) => ({
        name: track.name,
        volume:
          typeof track.volume === "number" && Number.isFinite(track.volume)
            ? Math.max(0, Math.min(1.5, track.volume))
            : 1,
        pan:
          typeof track.pan === "number" && Number.isFinite(track.pan)
            ? Math.max(-1, Math.min(1, track.pan))
            : 0,
        muted: Boolean(track.muted),
        solo: Boolean(track.solo),
      }));

    const masterVolume =
      typeof parsed.masterVolume === "number" && Number.isFinite(parsed.masterVolume)
        ? Math.max(0, Math.min(1.5, parsed.masterVolume))
        : 1;

    return {
      masterVolume,
      tracks: cleanedTracks,
    };
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
    updateStatus("Saved project data was invalid and has been reset.");
    return null;
  }
}

function takeRestoredSettingsForTrack(name) {
  if (!persistedProject?.tracks?.length) return null;
  const index = persistedProject.tracks.findIndex((track) => track.name === name);
  if (index === -1) return null;
  const [settings] = persistedProject.tracks.splice(index, 1);
  return settings;
}

function applyProjectSettingsToTrack(track, savedSettings) {
  if (!savedSettings) return;
  track.volume = savedSettings.volume;
  track.pan = savedSettings.pan;
  track.muted = savedSettings.muted;
  track.solo = savedSettings.solo;
}

async function ensureAudio() {
  if (!state.audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContextClass();

    state.masterGain = state.audioContext.createGain();
    state.recordingDestination = state.audioContext.createMediaStreamDestination();
    state.masterGain.connect(state.audioContext.destination);
    state.masterGain.connect(state.recordingDestination);
    state.masterGain.gain.value = Number(el.masterVolume.value);
  }

  if (state.audioContext.state === "suspended") {
    await state.audioContext.resume();
  }
}

function writeAsciiToDataView(view, offset, text) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function audioBufferToWavBlob(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAsciiToDataView(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAsciiToDataView(view, 8, "WAVE");
  writeAsciiToDataView(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeAsciiToDataView(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const channelData = [];
  for (let c = 0; c < numChannels; c++) {
    channelData.push(audioBuffer.getChannelData(c));
  }

  let pos = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channelData[c][i];
      sample = Math.max(-1, Math.min(1, sample));
      const intSample =
        sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
      view.setInt16(pos, intSample, true);
      pos += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function concatUint8Arrays(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function audioBufferToInt32Interleaved(audioBuffer) {
  const channels = audioBuffer.numberOfChannels;
  const samplesPerChannel = audioBuffer.length;
  const interleaved = new Int32Array(samplesPerChannel * channels);
  const channelData = [];

  for (let channel = 0; channel < channels; channel++) {
    channelData.push(audioBuffer.getChannelData(channel));
  }

  let writeIndex = 0;
  for (let sampleIndex = 0; sampleIndex < samplesPerChannel; sampleIndex++) {
    for (let channel = 0; channel < channels; channel++) {
      let sample = channelData[channel][sampleIndex];
      sample = Math.max(-1, Math.min(1, sample));
      interleaved[writeIndex++] =
        sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
    }
  }

  return interleaved;
}

async function ensureFlacReady() {
  const flac = FlacModule || globalThis.Flac;
  if (!flac) {
    throw new Error("FLAC encoder is unavailable in this browser.");
  }
  if (flac.isReady()) return flac;

  await new Promise((resolve) => {
    flac.on("ready", resolve);
  });
  return flac;
}

async function audioBufferToFlacBlob(audioBuffer) {
  const flac = await ensureFlacReady();
  const sampleRate = audioBuffer.sampleRate;
  const channels = audioBuffer.numberOfChannels;
  const bitsPerSample = 16;
  const compressionLevel = 5;
  const totalSamples = audioBuffer.length;
  const verify = true;
  const chunks = [];

  const encoder = flac.create_libflac_encoder(
    sampleRate,
    channels,
    bitsPerSample,
    compressionLevel,
    totalSamples,
    verify,
  );
  if (!encoder) {
    throw new Error("Could not create FLAC encoder.");
  }

  try {
    const initStatus = flac.init_encoder_stream(
      encoder,
      (buffer) => {
        chunks.push(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
      },
      undefined,
      false,
    );

    if (initStatus !== 0) {
      throw new Error(`Could not initialize FLAC encoder (status ${initStatus}).`);
    }

    const interleavedPcm = audioBufferToInt32Interleaved(audioBuffer);
    const didEncode = flac.FLAC__stream_encoder_process_interleaved(
      encoder,
      interleavedPcm,
      totalSamples,
    );
    if (!didEncode) {
      throw new Error("FLAC encoding failed while processing audio samples.");
    }

    const didFinish = flac.FLAC__stream_encoder_finish(encoder);
    if (!didFinish) {
      throw new Error("FLAC encoding could not finalize.");
    }

    const flacData = concatUint8Arrays(chunks);
    return new Blob([flacData], { type: "audio/flac" });
  } finally {
    flac.FLAC__stream_encoder_delete(encoder);
  }
}

function createTrackNodeState(buffer) {
  const gainNode = state.audioContext.createGain();
  const pannerNode = state.audioContext.createStereoPanner();

  gainNode.connect(pannerNode);
  pannerNode.connect(state.masterGain);

  return {
    buffer,
    gainNode,
    pannerNode,
    sourceNode: null,
    startedAt: 0,
    pausedAt: 0,
  };
}

async function addAudioFile(file) {
  try {
    await ensureAudio();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await state.audioContext.decodeAudioData(arrayBuffer);
    addDecodedTrack(buffer, file.name);
    updateStatus(`Loaded ${file.name}`);
  } catch (error) {
    updateStatus(`Could not load "${file.name}". Please try another audio file.`);
    console.error(error);
  }
}

function canAddTrack() {
  if (state.tracks.length < MAX_TRACKS) {
    return true;
  }
  updateStatus(`Track limit reached (${MAX_TRACKS}). Remove one to add another.`);
  return false;
}

function normalizeExclusiveSolo() {
  const soloed = state.tracks.filter((t) => t.solo);
  if (soloed.length <= 1) return;
  const keep = soloed[0];
  state.tracks.forEach((t) => {
    t.solo = t.id === keep.id;
  });
  state.tracks.forEach(applyAudibleState);
}

function addDecodedTrack(buffer, name) {
  if (!canAddTrack()) return false;

  const id = state.nextTrackId++;
  const nodeState = createTrackNodeState(buffer);
  const track = {
    id,
    name,
    volume: 1,
    pan: 0,
    muted: false,
    solo: false,
    ...nodeState,
  };
  applyProjectSettingsToTrack(track, takeRestoredSettingsForTrack(name));

  state.tracks.push(track);
  normalizeExclusiveSolo();
  state.tracks.forEach(applyAudibleState);
  renderTracks();
  refreshControls();
  saveProjectToStorage();
  return true;
}

function getSoloState() {
  return state.tracks.some((track) => track.solo);
}

function applyAudibleState(track) {
  const hasSolo = getSoloState();
  const shouldBeAudible = hasSolo ? track.solo : !track.muted;
  track.gainNode.gain.value = shouldBeAudible ? track.volume : 0;
  track.pannerNode.pan.value = track.pan;
}

function panAriaValueText(pan) {
  if (pan <= -0.95) return "full left";
  if (pan >= 0.95) return "full right";
  if (Math.abs(pan) < 0.05) return "center";
  if (pan < 0) return `${Math.round(Math.abs(pan) * 100)} percent left of center`;
  return `${Math.round(pan * 100)} percent right of center`;
}

function stopTrackSource(track) {
  if (!track.sourceNode) return;
  const source = track.sourceNode;
  source.onended = null;
  try {
    source.stop();
  } catch (error) {
    // Source may already be stopped.
  }
  source.disconnect();
  track.sourceNode = null;
}

function stopPlayback() {
  state.tracks.forEach((track) => {
    stopTrackSource(track);
    track.pausedAt = 0;
  });
  state.isPlaying = false;
  state.playbackStartedAt = 0;
  refreshControls();
}

function handlePlaybackEnded() {
  const hasAnyPlaying = state.tracks.some((track) => track.sourceNode);
  if (hasAnyPlaying) return;

  state.isPlaying = false;
  const wasRecording = state.recorder?.state === "recording";
  if (wasRecording) {
    stopRecording();
  }
  refreshControls();
  if (!wasRecording) {
    updateStatus("Playback finished");
  }
}

function startPlayback() {
  if (!state.tracks.length || state.isPlaying) return;

  state.playbackStartedAt = state.audioContext.currentTime;
  state.isPlaying = true;

  state.tracks.forEach((track) => {
    const source = state.audioContext.createBufferSource();
    source.buffer = track.buffer;
    source.connect(track.gainNode);
    source.onended = () => {
      if (track.sourceNode === source) {
        track.sourceNode = null;
      }
      handlePlaybackEnded();
    };

    track.startedAt = state.audioContext.currentTime;
    track.sourceNode = source;
    source.start(0, 0);
    applyAudibleState(track);
  });

  refreshControls();
}

function removeTrack(trackId) {
  const index = state.tracks.findIndex((track) => track.id === trackId);
  if (index === -1) return;
  stopTrackSource(state.tracks[index]);
  state.tracks[index].gainNode.disconnect();
  state.tracks[index].pannerNode.disconnect();
  state.tracks.splice(index, 1);

  if (!state.tracks.length) {
    stopPlayback();
  }

  renderTracks();
  refreshControls();
  saveProjectToStorage();
}

function setTrackValue(trackId, field, value) {
  const track = state.tracks.find((item) => item.id === trackId);
  if (!track) return;
  if (field === "solo") {
    if (value) {
      state.tracks.forEach((t) => {
        t.solo = t.id === trackId;
      });
      state.tracks.forEach(applyAudibleState);
    } else {
      track.solo = false;
      state.tracks.forEach(applyAudibleState);
    }
  } else {
    track[field] = value;
    applyAudibleState(track);
  }
  saveProjectToStorage();
}

function startRecording() {
  if (state.recorder && state.recorder.state === "recording") return;
  state.chunks = [];
  state.recordingBlob = null;

  state.recorder = new MediaRecorder(state.recordingDestination.stream);
  state.recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      state.chunks.push(event.data);
    }
  };
  state.recorder.onstop = () => {
    state.recordingBlob = new Blob(state.chunks, { type: "audio/webm" });
    refreshControls();
    updateStatus("Recording complete. Download is ready.");
  };

  state.recorder.start();
  refreshControls();
  updateStatus("Recording...");
}

function stopRecording() {
  if (!state.recorder || state.recorder.state !== "recording") return;
  state.recorder.stop();
  refreshControls();
}

function stopRecordingSession() {
  if (state.recorder?.state === "recording") {
    stopRecording();
  }
  if (state.isPlaying) {
    stopPlayback();
  }
}

function downloadRecording() {
  if (!state.recordingBlob) return;
  const url = URL.createObjectURL(state.recordingBlob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `left-and-right-mashup-${Date.now()}.webm`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function baseNameWithoutExtension(filename) {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return filename;
  return filename.slice(0, dot);
}

function updateConversionStatus(message) {
  el.conversionStatus.textContent = message;
}

async function decodeFileToAudioBuffer(file) {
  await ensureAudio();
  const raw = await file.arrayBuffer();
  return state.audioContext.decodeAudioData(raw.slice(0));
}

async function convertWebmFileToWav(file) {
  updateConversionStatus("Converting…");
  el.convertWebmInput.disabled = true;
  el.convertWebmLabel.dataset.disabled = "true";

  try {
    const audioBuffer = await decodeFileToAudioBuffer(file);
    const wavBlob = audioBufferToWavBlob(audioBuffer);
    const url = URL.createObjectURL(wavBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const base = baseNameWithoutExtension(file.name || "recording");
    anchor.download = `${base}.wav`;
    anchor.click();
    URL.revokeObjectURL(url);
    updateConversionStatus(`WAV ready: ${anchor.download}`);
  } catch (error) {
    console.error(error);
    updateConversionStatus(
      "Could not decode this file as WebM audio. Try another file or browser.",
    );
  } finally {
    el.convertWebmInput.disabled = false;
    el.convertWebmLabel.dataset.disabled = "false";
    el.convertWebmInput.value = "";
  }
}

async function convertFileToFlac(file) {
  updateConversionStatus("Converting…");
  el.convertFlacInput.disabled = true;
  el.convertFlacLabel.dataset.disabled = "true";

  try {
    const audioBuffer = await decodeFileToAudioBuffer(file);
    const flacBlob = await audioBufferToFlacBlob(audioBuffer);
    const url = URL.createObjectURL(flacBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const base = baseNameWithoutExtension(file.name || "recording");
    anchor.download = `${base}.flac`;
    anchor.click();
    URL.revokeObjectURL(url);
    updateConversionStatus(`FLAC ready: ${anchor.download}`);
  } catch (error) {
    console.error(error);
    updateConversionStatus(
      "Could not convert this file to FLAC. Try a different file or browser.",
    );
  } finally {
    el.convertFlacInput.disabled = false;
    el.convertFlacLabel.dataset.disabled = "false";
    el.convertFlacInput.value = "";
  }
}

function refreshControls() {
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

function renderTracks() {
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
      if (action === "remove") removeTrack(track.id);
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

el.fileInput.addEventListener("change", async (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.files?.length) return;

  const availableSlots = Math.max(0, MAX_TRACKS - state.tracks.length);
  const files = [...input.files].slice(0, availableSlots);

  if (files.length < input.files.length) {
    updateStatus(
      `Only ${MAX_TRACKS} tracks are supported. Extra file(s) were skipped.`,
    );
  }

  for (const file of files) {
    await addAudioFile(file);
  }
  input.value = "";
});

el.playBtn.addEventListener("click", async () => {
  await ensureAudio();
  startPlayback();
  updateStatus("Playing");
});

el.stopBtn.addEventListener("click", () => {
  stopRecordingSession();
  updateStatus("Stopped");
});

el.recordBtn.addEventListener("click", async () => {
  await ensureAudio();

  if (state.recorder?.state === "recording") {
    stopRecordingSession();
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

function initializeFromStorage() {
  if (!persistedProject) return;

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

initializeFromStorage();
updateConversionStatus("Choose a WebM file to convert.");
refreshControls();
