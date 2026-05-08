import { state, el } from "../state.js";
import { audioBufferToWavBlob, audioBufferToFlacBlob } from "./encoders.js";
import { ensureAudio } from "./mixer.js";
import { updateConversionStatus } from "../ui/render.js";

export function baseNameWithoutExtension(filename) {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return filename;
  return filename.slice(0, dot);
}

export async function decodeFileToAudioBuffer(file) {
  await ensureAudio();
  const raw = await file.arrayBuffer();
  return state.audioContext.decodeAudioData(raw.slice(0));
}

export async function convertWebmFileToWav(file) {
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

export async function convertFileToFlac(file) {
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
