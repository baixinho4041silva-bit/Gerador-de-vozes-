
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
  // Inicialização conforme diretrizes estritas do SDK
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const tone = getToneLabel(settings.temperature);
  const prompt = `[Direction: Style: ${settings.style || 'Natural'}, Accent: ${settings.accent || 'Neutral'}, ${tone}] ${text}`;

  const apiVoiceName = VOICE_MAP[settings.voice] || settings.voice;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        seed: 42,
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
      console.error("API Response Details:", response);
      throw new Error("A API não retornou dados de áudio. Verifique se o texto não viola políticas de segurança ou se há problemas de conexão.");
    }

    const audioBytes = decode(base64Audio);
    return await decodeAudioData(audioBytes, audioContext);
  } catch (error: any) {
    console.error("Erro na geração Gemini TTS:", error);
    throw error;
  }
}
