// Spec 40: our own curves, in dB, one gain per band from 31 Hz to 16 kHz.
export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const EQ_PRESETS = [
  { id: "acoustic", name: "Acoustic", gains: [4, 4, 3, 1, 1, 1, 2, 3, 3, 2] },
  { id: "bass-booster", name: "Bass Booster", gains: [5, 4, 3, 2, 1, 0, 0, 0, 0, 0] },
  { id: "bass-reducer", name: "Bass Reducer", gains: [-5, -4, -3, -2, -1, 0, 0, 0, 0, 0] },
  { id: "classical", name: "Classical", gains: [4, 3, 2, 1, -1, -1, 0, 2, 3, 3] },
  { id: "dance", name: "Dance", gains: [4, 6, 4, 0, 1, 2, 4, 4, 3, 0] },
  { id: "deep", name: "Deep", gains: [4, 3, 1, 1, 2, 1, -1, -2, -3, -4] },
  { id: "electronic", name: "Electronic", gains: [4, 3, 1, 0, -2, 2, 1, 1, 3, 4] },
  { id: "hip-hop", name: "Hip-Hop", gains: [5, 4, 1, 3, -1, -1, 1, -1, 2, 3] },
  { id: "jazz", name: "Jazz", gains: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
  { id: "latin", name: "Latin", gains: [4, 3, 0, 0, -1, -1, -1, 0, 3, 4] },
  { id: "loudness", name: "Loudness", gains: [5, 4, 0, 0, -2, 0, -1, -4, 4, 1] },
  { id: "lounge", name: "Lounge", gains: [-3, -2, -1, 1, 3, 2, 0, -2, 2, 1] },
  { id: "piano", name: "Piano", gains: [2, 1, 0, 2, 3, 1, 3, 4, 3, 3] },
  { id: "pop", name: "Pop", gains: [-1, -1, 0, 2, 4, 4, 2, 0, -1, -2] },
  { id: "r-and-b", name: "R&B", gains: [3, 6, 5, 1, -2, -1, 2, 2, 3, 3] },
  { id: "rock", name: "Rock", gains: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4] },
  { id: "small-speakers", name: "Small Speakers", gains: [5, 4, 3, 2, 1, 0, -1, -2, -3, -4] },
  { id: "spoken-word", name: "Spoken Word", gains: [-4, -1, 0, 1, 3, 4, 4, 3, 1, -2] },
  { id: "treble-booster", name: "Treble Booster", gains: [0, 0, 0, 0, 0, 1, 2, 3, 4, 5] },
  { id: "treble-reducer", name: "Treble Reducer", gains: [0, 0, 0, 0, 0, -1, -2, -3, -4, -5] },
  { id: "vocal-booster", name: "Vocal Booster", gains: [-2, -3, -3, 1, 4, 4, 3, 1, 0, -2] },
];

const FLAT = EQ_BANDS.map(() => 0);

export const eqGains = (id) => EQ_PRESETS.find((preset) => preset.id === id)?.gains ?? FLAT;

// Spec 43: minus the largest gain, less a further 1.5 dB, so a boost cannot clip even where
// neighbouring bands add up. With no boost there is nothing to take back.
const HEADROOM = 1.5;

export function eqPreamp(gains) {
  const largest = Math.max(...gains);
  return largest > 0 ? -largest - HEADROOM : 0;
}

export const CONTRASTS = [
  { id: "lightest", key: "contrastLightest", value: 0.7 },
  { id: "light", key: "contrastLight", value: 0.85 },
  { id: "normal", key: "contrastNormal", value: 1 },
  { id: "dark", key: "contrastDark", value: 1.2 },
  { id: "darkest", key: "contrastDarkest", value: 1.4 },
];
