import { state, el, MAX_TRACKS, STORAGE_KEY } from "./state.js";

// Module-private; initialized via initPersistence() called from main.js
// after the DOM and el registry are ready.
let persistedProject = null;

export function initPersistence(onInvalidData) {
  persistedProject = _loadPersistedProject(onInvalidData);
}

export function getPersistedProject() {
  return persistedProject;
}

function _loadPersistedProject(onInvalidData) {
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

    return { masterVolume, tracks: cleanedTracks };
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
    onInvalidData?.("Saved project data was invalid and has been reset.");
    return null;
  }
}

export function saveProjectToStorage() {
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

export function takeRestoredSettingsForTrack(name) {
  if (!persistedProject?.tracks?.length) return null;
  const index = persistedProject.tracks.findIndex((track) => track.name === name);
  if (index === -1) return null;
  const [settings] = persistedProject.tracks.splice(index, 1);
  return settings;
}

export function applyProjectSettingsToTrack(track, savedSettings) {
  if (!savedSettings) return;
  track.volume = savedSettings.volume;
  track.pan = savedSettings.pan;
  track.muted = savedSettings.muted;
  track.solo = savedSettings.solo;
}
