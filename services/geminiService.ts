
import { GoogleGenAI, Modality } from "@google/genai";
import { decode, decodeAudioData } from "../utils/audioUtils";
import { GlobalSettings, ToneLabel, VOICE_MAP } from "../types";

export const getToneLabel = (temp: number): ToneLabel => {
  if (temp < 0.5) return ToneLabel.VERY_FLAT;
  if (temp < 1.5) return ToneLabel.BALANCED;
  if (temp < 2.5) return ToneLabel.EXPRESSIVE;
  return ToneLabel.HIGHLY_EXPRESSIVE;
};

export async function generateTTS(
  text: string, 
  settings: GlobalSettings,
  audioContext: AudioContext
): Promise<AudioBuffer> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const tone = getToneLabel(settings.temperature);
  // Using the requested format: [Direction: ...] Texto
  const prompt = `[Direction: Style: ${settings.style || 'Natural'}, Accent: ${settings.accent || 'Neutral'}, ${tone}] ${text}`;

  // Use the mapped voice name if it exists, otherwise use the selected name
  const apiVoiceName = VOICE_MAP[settings.voice] || settings.voice;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      seed: 42, // Fixed seed as requested
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: apiVoiceName },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  
  if (!base64Audio) {
    throw new Error("No audio data returned from Gemini API");
  }

  const audioBytes = decode(base64Audio);
  return await decodeAudioData(audioBytes, audioContext);
}
