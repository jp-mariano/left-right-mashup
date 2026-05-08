import { state, el, MAX_TRACKS } from "../state.js";
import {
  saveProjectToStorage,
  takeRestoredSettingsForTrack,
  applyProjectSettingsToTrack,
} from "../persistence.js";

export async function ensureAudio() {
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

export function createTrackNodeState(buffer) {
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

export function getSoloState() {
  return state.tracks.some((track) => track.solo);
}

export function applyAudibleState(track) {
  const hasSolo = getSoloState();
  const shouldBeAudible = hasSolo ? track.solo : !track.muted;
  track.gainNode.gain.value = shouldBeAudible ? track.volume : 0;
  track.pannerNode.pan.value = track.pan;
}

export function normalizeExclusiveSolo() {
  const soloed = state.tracks.filter((t) => t.solo);
  if (soloed.length <= 1) return;
  const keep = soloed[0];
  state.tracks.forEach((t) => {
    t.solo = t.id === keep.id;
  });
  state.tracks.forEach(applyAudibleState);
}

export function stopTrackSource(track) {
  if (!track.sourceNode) return;
  const source = track.sourceNode;
  source.onended = null;
  try {
    source.stop();
  } catch (_) {
    // Source may already be stopped.
  }
  source.disconnect();
  track.sourceNode = null;
}

// Returns true if the track was added, false if the limit was already reached.
export function addDecodedTrack(buffer, name) {
  if (state.tracks.length >= MAX_TRACKS) return false;

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
  saveProjectToStorage();
  return true;
}

// Returns { success, name } — callers are responsible for status messages
// and re-rendering.
export async function addAudioFile(file) {
  try {
    await ensureAudio();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await state.audioContext.decodeAudioData(arrayBuffer);
    addDecodedTrack(buffer, file.name);
    return { success: true, name: file.name };
  } catch (error) {
    console.error(error);
    return { success: false, name: file.name };
  }
}

export function removeTrack(trackId) {
  const index = state.tracks.findIndex((track) => track.id === trackId);
  if (index === -1) return;

  stopTrackSource(state.tracks[index]);
  state.tracks[index].gainNode.disconnect();
  state.tracks[index].pannerNode.disconnect();
  state.tracks.splice(index, 1);

  // Reset playback state when the last track is removed so controls reflect it.
  if (!state.tracks.length) {
    state.isPlaying = false;
    state.playbackStartedAt = 0;
  }

  saveProjectToStorage();
}

export function setTrackValue(trackId, field, value) {
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
