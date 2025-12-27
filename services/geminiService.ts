
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
  // Always create a new instance to ensure we use the freshly selected API Key from the environment
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API key is missing. Please click on 'Configurar Chave API' to select your key.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
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
      throw new Error("A API não retornou dados de áudio. Isso pode ocorrer se sua chave de API não tiver acesso ao modelo de TTS ou se houver restrições de faturamento.");
    }

    const audioBytes = decode(base64Audio);
    return await decodeAudioData(audioBytes, audioContext);
  } catch (error: any) {
    console.error("Erro na geração Gemini TTS:", error);
    // Standard error message handling for missing Project/Entity
    if (error.message?.includes("entity was not found")) {
      throw new Error("O projeto vinculado a esta chave de API não foi encontrado ou não suporta o modelo Gemini 2.5 TTS. Verifique o faturamento em console.cloud.google.com.");
    }
    throw error;
  }
}
