import { state } from "../state.js";
import { applyAudibleState, stopTrackSource } from "./mixer.js";
import { stopRecording } from "./recording.js";
import { refreshControls, updateStatus } from "../ui/render.js";

export function stopPlayback() {
  state.tracks.forEach((track) => {
    stopTrackSource(track);
    track.pausedAt = 0;
  });
  state.isPlaying = false;
  state.playbackStartedAt = 0;
  refreshControls();
}

export function handlePlaybackEnded() {
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

export function startPlayback() {
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
