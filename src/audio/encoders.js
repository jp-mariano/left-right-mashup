import FlacModule from "libflacjs/dist/libflac.js";

export function writeAsciiToDataView(view, offset, text) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

export function audioBufferToWavBlob(audioBuffer) {
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

export function concatUint8Arrays(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function audioBufferToInt32Interleaved(audioBuffer) {
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

export async function ensureFlacReady() {
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

export async function audioBufferToFlacBlob(audioBuffer) {
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
