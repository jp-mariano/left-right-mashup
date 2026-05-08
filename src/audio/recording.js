import { state } from "../state.js";
import { refreshControls, updateStatus } from "../ui/render.js";

export function startRecording() {
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

export function stopRecording() {
  if (!state.recorder || state.recorder.state !== "recording") return;
  state.recorder.stop();
  refreshControls();
}

export function downloadRecording() {
  if (!state.recordingBlob) return;
  const url = URL.createObjectURL(state.recordingBlob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `left-right-mashup-${Date.now()}.webm`;
  anchor.click();
  URL.revokeObjectURL(url);
}
