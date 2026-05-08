# Left Right Mashup

Browser-based stereo mashup tool for loading up to 2 local audio files, setting each track to left/right/center, and exporting a mixed recording.

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Manual QA checklist

- Load 1-2 audio files and verify both appear as tracks.
- Change per-track volume and pan and confirm audio updates immediately.
- Toggle mute/solo and verify track routing behaves correctly (only one track can be solo at a time; clearing solo while playing should bring non-muted tracks back in the mix).
- Click Play and Stop and verify playback starts/stops reliably; let playback run to the end and confirm status updates from "Playing" to "Playback finished."
- Click Start Recording, then stop midway, then download and verify the exported WebM plays correctly.
- In **Convert WebM to WAV**, choose the same WebM (or another WebM) and confirm a `.wav` file downloads and plays.
- In **Convert Audio Files**, choose a WebM or WAV file in **WebM or WAV to FLAC** and confirm a `.flac` file downloads and plays.
- Let playback finish while recording and verify recording auto-stops.
- Refresh the page and verify:
  - master volume restores from previous session
  - saved track settings message appears
  - re-uploading a file with the same name restores its previous track settings
- Keyboard and screen reader: Tab through controls; activate buttons with Enter or Space; adjust sliders with arrow keys. Confirm focus outlines are visible and that assistive tech reads meaningful names for transport, upload, each track’s volume and pan, and mute/solo state.

## Deploy (Vercel)

1. Push this project to a Git repository.
2. Import the repository in Vercel.
3. Use defaults:
   - Build command: `npm run build`
   - Output directory: `dist`
4. Deploy.

## Deploy (Netlify)

1. Push this project to a Git repository.
2. Import the repository in Netlify.
3. Use:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Deploy.
