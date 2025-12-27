
export interface GlobalSettings {
  voice: string;
  speed: number;
  temperature: number;
  style: string;
  accent: string;
}

export interface AudioBlock {
  id: string;
  text: string;
  isGenerating: boolean;
  audioBuffer: AudioBuffer | null;
  audioUrl: string | null;
  playbackSpeed: number;
  playbackVolume: number;
}

export enum ToneLabel {
  VERY_FLAT = "Tone: Very Flat",
  BALANCED = "Tone: Balanced",
  EXPRESSIVE = "Tone: Expressive",
  HIGHLY_EXPRESSIVE = "Tone: Highly Expressive"
}

// Names exactly as requested by the user for the UI
export const VOICES = [
  "Zephyr", "Puck", "Caronte", "Kore", "Fenrir", "Leda", "Orus", "Aoede", 
  "Calirrhoe", "Autonoe", "Encélado", "Japeto", "Umbriel", "Algieba", 
  "Despina", "Erinome", "Algenibe", "Rasalgethi", "Laomedeia", "Alchernar", 
  "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", 
  "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat"
];

// Mapping for API compatibility (Gemini API uses specific English astronomical names)
export const VOICE_MAP: Record<string, string> = {
  "Caronte": "Charon",
  "Encélado": "Enceladus",
  "Japeto": "Iapetus",
  "Algenibe": "Algenib",
  "Alchernar": "Achernar"
};
