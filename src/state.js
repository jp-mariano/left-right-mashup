export const state = {
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

export const MAX_TRACKS = 2;
export const STORAGE_KEY = "left-right-mashup";

// Populated in main.js after HTML injection.
// All modules import this same object reference so mutations are shared.
export const el = {};
