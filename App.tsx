
import React, { useState, useCallback, useRef, useEffect } from 'react';
import JSZip from 'https://esm.sh/jszip@3.10.1';
import { 
  Play, 
  Square, 
  Download, 
  Plus, 
  Trash2, 
  Settings, 
  Mic2, 
  Volume2, 
  Zap,
  RotateCcw,
  FileArchive,
  Music,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Key,
  ExternalLink
} from 'lucide-react';

import { GlobalSettings, AudioBlock, VOICES, ToneLabel } from './types';
import { generateTTS, getToneLabel } from './services/geminiService';
import { audioBufferToWav, mergeAudioBuffers } from './utils/audioUtils';

const createInitialBlock = (): AudioBlock => ({
  id: Math.random().toString(36).substr(2, 9),
  text: '',
  isGenerating: false,
  audioBuffer: null,
  audioUrl: null,
  playbackSpeed: 1,
  playbackVolume: 1
});

export default function App() {
  const [settings, setSettings] = useState<GlobalSettings>({
    voice: 'Kore',
    speed: 1,
    temperature: 1,
    style: '',
    accent: ''
  });

  const [blocks, setBlocks] = useState<AudioBlock[]>([createInitialBlock()]);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isStoppingRef = useRef(false);

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000
    });

    const checkKey = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const selected = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } else if (process.env.API_KEY) {
        setHasApiKey(true);
      }
    };
    checkKey();

    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  const handleOpenKeySelector = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      setHasApiKey(true);
    } else {
      alert("Ambiente sem suporte a seleção de chaves.");
    }
  };

  const handleSpeedChange = (delta: number) => {
    setSettings(prev => {
      const newSpeed = Math.max(0.5, Math.min(3, prev.speed + delta));
      return { ...prev, speed: parseFloat(newSpeed.toFixed(2)) };
    });
  };

  const handlePreviewVoice = async () => {
    if (!audioContextRef.current) return;
    try {
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      const buffer = await generateTTS("Prévia.", settings, audioContextRef.current);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      source.start();
    } catch (err: any) {
      if (err.message?.includes("API key")) {
        handleOpenKeySelector();
      } else {
        alert(`Erro na prévia: ${err.message}`);
      }
    }
  };

  const updateBlock = (id: string, updates: Partial<AudioBlock>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const deleteBlock = (id: string) => {
    if (blocks.length <= 1) return;
    setBlocks(prev => prev.filter(b => b.id !== id));
  };

  const insertBlockBelow = (id: string) => {
    const newBlock = createInitialBlock();
    const index = blocks.findIndex(b => b.id === id);
    const newBlocks = [...blocks];
    newBlocks.splice(index + 1, 0, newBlock);
    setBlocks(newBlocks);
  };

  const generateSingleAudio = async (blockId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block || !block.text || !audioContextRef.current) return;

    updateBlock(blockId, { isGenerating: true });
    try {
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      const buffer = await generateTTS(block.text, settings, audioContextRef.current);
      const blob = audioBufferToWav(buffer);
      const url = URL.createObjectURL(blob);
      updateBlock(blockId, { 
        audioBuffer: buffer, 
        audioUrl: url, 
        isGenerating: false 
      });
    } catch (err: any) {
      if (err.message?.includes("API key") || err.message?.includes("entity was not found")) {
        handleOpenKeySelector();
      } else {
        alert(`Erro Trecho ${blocks.findIndex(b => b.id === blockId) + 1}: ${err.message}`);
      }
      updateBlock(blockId, { isGenerating: false });
    }
  };

  const playSingleAudio = async (block: AudioBlock) => {
    if (!block.audioBuffer || !audioContextRef.current) return;
    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
    currentSourceRef.current?.stop();
    const source = audioContextRef.current.createBufferSource();
    source.buffer = block.audioBuffer;
    source.playbackRate.value = block.playbackSpeed;
    const gainNode = audioContextRef.current.createGain();
    gainNode.gain.value = block.playbackVolume;
    source.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);
    source.start();
    currentSourceRef.current = source;
  };

  const generateAll = async () => {
    const ungenerated = blocks.filter(b => b.text && !b.audioBuffer);
    for (const block of ungenerated) await generateSingleAudio(block.id);
  };

  const stopPlayback = () => {
    isStoppingRef.current = true;
    currentSourceRef.current?.stop();
    setIsPlayingAll(false);
    setCurrentPlayingIndex(null);
  };

  const playSequential = async () => {
    if (isPlayingAll) { stopPlayback(); return; }
    const available = blocks.filter(b => b.audioBuffer);
    if (available.length === 0) { alert("Gere áudios primeiro."); return; }
    setIsPlayingAll(true);
    isStoppingRef.current = false;
    if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
    for (let i = 0; i < blocks.length; i++) {
      if (isStoppingRef.current) break;
      const block = blocks[i];
      if (block.audioBuffer && audioContextRef.current) {
        setCurrentPlayingIndex(i);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = block.audioBuffer;
        source.playbackRate.value = block.playbackSpeed;
        source.connect(audioContextRef.current.destination);
        const playPromise = new Promise<void>((resolve) => { source.onended = () => resolve(); });
        source.start();
        currentSourceRef.current = source;
        await playPromise;
      }
    }
    if (!isStoppingRef.current) { setIsPlayingAll(false); setCurrentPlayingIndex(null); }
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    let count = 0;
    blocks.forEach((b, i) => { if (b.audioBuffer) { zip.file(`trecho_${i+1}.wav`, audioBufferToWav(b.audioBuffer)); count++; } });
    if (!count) return;
    const content = await zip.generateAsync({ type: "blob" });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = "edson_tts.zip";
    a.click();
  };

  const downloadMerged = () => {
    if (!audioContextRef.current) return;
    const valid = blocks.map(b => b.audioBuffer).filter((b): b is AudioBuffer => b !== null);
    if (!valid.length) return;
    const merged = mergeAudioBuffers(valid, audioContextRef.current);
    if (merged) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(audioBufferToWav(merged));
      a.download = "faixa_completa.wav";
      a.click();
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-dark-bg">
      <header className="relative z-50 glass-card m-4 rounded-2xl p-4 flex flex-col gap-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="pixel-highlight text-[12px] md:text-[14px] text-brand-red font-bold mb-2 animate-glow">EDSON AUTOMAÇÃO</span>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-red flex items-center justify-center text-white shadow-lg shadow-brand-red/30"><Mic2 size={20} /></div>
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">Gerador de Áudio TTS</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleOpenKeySelector}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold transition-all uppercase tracking-widest ${hasApiKey ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-brand-red text-white animate-pulse'}`}
            >
              <Key size={14} /> {hasApiKey ? "Chave Configurada" : "Inserir Chave API"}
            </button>
            <button onClick={() => { if(confirm("Limpar tudo?")) setBlocks([createInitialBlock()]); }} className="glass-btn px-4 py-2 rounded-xl text-xs flex items-center gap-2 text-white/50 hover:text-white"><RotateCcw size={14} /> Limpar</button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button onClick={generateAll} className="primary-btn py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold text-white"><Zap size={18} fill="white" /> Gerar Todos</button>
          <button onClick={playSequential} className="glass-btn py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold">
            {isPlayingAll ? <Square size={18} className="text-brand-red fill-brand-red" /> : <Play size={18} className="text-white fill-white" />} {isPlayingAll ? "Interromper" : "Reproduzir Todos"}
          </button>
          <button onClick={downloadZip} className="glass-btn py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"><FileArchive size={18} className="text-brand-red" /> Baixar Tudo (.zip)</button>
          <button onClick={downloadMerged} className="glass-btn py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold"><Music size={18} className="text-brand-red" /> Baixar Faixa Única</button>
        </div>
      </header>

      {!hasApiKey && (
        <div className="mx-4 mb-4 glass-card p-4 rounded-xl flex items-center justify-between border-brand-red bg-brand-red/10 animate-pulse">
          <div className="flex items-center gap-3"><AlertCircle className="text-brand-red" size={20} /><p className="text-xs text-white/80">O modelo Gemini 2.5 TTS exige uma <strong>Chave de API com faturamento ativado</strong> no Google Cloud.</p></div>
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="flex items-center gap-1 text-[10px] font-bold text-brand-red uppercase hover:underline">Info Faturamento <ExternalLink size={12} /></a>
        </div>
      )}

      <main className="flex-1 flex flex-col md:flex-row gap-4 p-4 min-h-0">
        <aside className="w-full md:w-80 glass-card rounded-2xl p-6 flex flex-col gap-6 shadow-2xl overflow-y-auto">
          <div className="space-y-4">
            <label className="text-[10px] uppercase tracking-[0.2em] text-brand-red font-bold flex items-center gap-2 border-b border-brand-red/20 pb-2"><Settings size={14} /> Configurações Globais</label>
            <div className="space-y-2">
              <span className="text-[10px] text-white/40 font-medium">VOZ</span>
              <div className="flex gap-2">
                <select value={settings.voice} onChange={(e) => setSettings(s => ({ ...s, voice: e.target.value }))} className="flex-1 glass-input p-3 rounded-xl text-xs bg-dark-bg">
                  {VOICES.map(v => <option key={v} value={v} className="bg-[#1a1a21]">{v}</option>)}
                </select>
                <button onClick={handlePreviewVoice} className="glass-btn p-3 rounded-xl aspect-square flex items-center justify-center hover:bg-brand-red/20"><Play size={16} fill="white" /></button>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><span className="text-[10px] text-white/40 font-medium uppercase">Ritmo (Escala 0.25)</span><span className="text-[10px] font-bold text-brand-red">{settings.speed.toFixed(2)}x</span></div>
              <div className="flex items-center gap-3">
                <button onClick={() => handleSpeedChange(-0.25)} className="glass-btn w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs">-</button>
                <input type="range" min="0.5" max="3" step="0.25" value={settings.speed} onChange={(e) => setSettings(s => ({ ...s, speed: parseFloat(e.target.value) }))} className="flex-1 accent-brand-red h-1 bg-white/10 rounded-full appearance-none" />
                <button onClick={() => handleSpeedChange(0.25)} className="glass-btn w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs">+</button>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><span className="text-[10px] text-white/40 font-medium uppercase">Tom / Temperatura</span><span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-brand-red/10 text-brand-red">{getToneLabel(settings.temperature).split(':')[1].trim()}</span></div>
              <input type="range" min="0" max="3" step="0.1" value={settings.temperature} onChange={(e) => setSettings(s => ({ ...s, temperature: parseFloat(e.target.value) }))} className="w-full accent-brand-red h-1 bg-white/10 rounded-full appearance-none" />
              <div className="flex justify-between text-[8px] text-white/20 uppercase tracking-tighter"><span>Flat</span><span>Balanced</span><span>Expressive</span></div>
            </div>
            <div className="space-y-2"><span className="text-[10px] text-white/40 font-medium uppercase">Estilo</span><textarea value={settings.style} onChange={(e) => setSettings(s => ({ ...s, style: e.target.value }))} placeholder="Ex: Narrador épico..." className="w-full glass-input p-3 rounded-xl text-xs min-h-[60px] resize-none" /></div>
            <div className="space-y-2"><span className="text-[10px] text-white/40 font-medium uppercase">Sotaque</span><input type="text" value={settings.accent} onChange={(e) => setSettings(s => ({ ...s, accent: e.target.value }))} placeholder="Ex: Carioca..." className="w-full glass-input p-3 rounded-xl text-xs" /></div>
          </div>
        </aside>

        <section className="flex-1 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
          {blocks.map((block, index) => (
            <div key={block.id} className={`glass-card p-6 rounded-2xl transition-all duration-300 ${currentPlayingIndex === index ? 'border-brand-red/50 bg-brand-red/5 shadow-[0_0_30px_rgba(240,45,78,0.1)]' : ''}`}>
              <div className="flex flex-col lg:flex-row gap-5">
                <div className="flex-1 space-y-3">
                  <span className="text-[10px] font-bold text-brand-red tracking-[0.2em] uppercase">TRECHO {index + 1}</span>
                  <textarea value={block.text} onChange={(e) => updateBlock(block.id, { text: e.target.value })} placeholder="Texto para narrar..." className="w-full glass-input p-4 rounded-2xl text-sm min-h-[100px] resize-none" />
                </div>
                <div className="flex flex-row lg:flex-col gap-2 min-w-[150px]">
                  <button onClick={() => generateSingleAudio(block.id)} disabled={block.isGenerating || !block.text} className="flex-1 glass-btn p-4 rounded-xl flex items-center justify-center gap-2 text-[10px] font-bold uppercase disabled:opacity-30">
                    {block.isGenerating ? <div className="w-4 h-4 border-2 border-t-brand-red rounded-full animate-spin" /> : <Zap size={14} className="text-brand-red" fill="currentColor" />} Gerar Áudio
                  </button>
                  <button onClick={() => insertBlockBelow(block.id)} className="flex-1 glass-btn p-4 rounded-xl flex items-center justify-center gap-2 text-[10px] font-bold uppercase"><Plus size={14} /> Adicionar</button>
                  <button onClick={() => deleteBlock(block.id)} className="flex-1 glass-btn p-4 rounded-xl flex items-center justify-center gap-2 text-[10px] font-bold uppercase hover:!text-brand-red hover:!bg-brand-red/10"><Trash2 size={14} /> Excluir</button>
                </div>
              </div>
              {block.audioUrl && (
                <div className="mt-4 pt-4 border-t border-white/5 flex flex-wrap items-center gap-4 bg-black/20 p-4 rounded-xl">
                  <button onClick={() => playSingleAudio(block)} className="w-10 h-10 rounded-full primary-btn flex items-center justify-center"><Play size={18} fill="white" /></button>
                  <div className="flex-1 min-w-[150px] space-y-1">
                    <div className="flex justify-between text-[9px] font-bold text-white/40 uppercase"><span>Volume</span><span className="text-brand-red">{(block.playbackVolume * 100).toFixed(0)}%</span></div>
                    <input type="range" min="0" max="1" step="0.1" value={block.playbackVolume} onChange={(e) => updateBlock(block.id, { playbackVolume: parseFloat(e.target.value) })} className="w-full accent-brand-red h-1 bg-white/10 rounded-full appearance-none" />
                  </div>
                  <a href={block.audioUrl} download={`narração_${index+1}.wav`} className="primary-btn px-4 py-2 rounded-lg flex items-center gap-2 text-[10px] font-bold uppercase"><Download size={14} /> Download</a>
                </div>
              )}
            </div>
          ))}
          <button onClick={() => setBlocks(prev => [...prev, createInitialBlock()])} className="group p-8 rounded-3xl border-2 border-dashed border-white/5 hover:border-brand-red/30 hover:bg-brand-red/5 flex flex-col items-center justify-center gap-3 transition-all">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-brand-red group-hover:text-white"><Plus size={24} /></div>
            <span className="text-[10px] font-bold tracking-widest text-white/20 group-hover:text-white uppercase">Inserir Bloco ao Final</span>
          </button>
        </section>
      </main>

      <footer className="p-4 glass-card mx-4 mb-4 rounded-2xl flex items-center justify-between text-[10px] text-white/30 font-bold uppercase tracking-widest">
        <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-brand-red animate-pulse" /> ÁREA DE MEMBROS EXCLUSIVA</div>
        <div>Desenvolvido por <span className="text-brand-red">Edson Automação</span> • 2024</div>
      </footer>
    </div>
  );
}
