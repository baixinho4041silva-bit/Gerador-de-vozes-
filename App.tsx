
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
  CheckCircle2
} from 'lucide-react';

import { GlobalSettings, AudioBlock, VOICES, ToneLabel } from './types';
import { generateTTS, getToneLabel } from './services/geminiService';
import { audioBufferToWav, mergeAudioBuffers } from './utils/audioUtils';

// Helper to create initial block
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
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isStoppingRef = useRef(false);

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  // Handlers for global settings
  const handleSpeedChange = (delta: number) => {
    setSettings(prev => ({
      ...prev,
      speed: Math.max(0.5, Math.min(3, parseFloat((prev.speed + delta).toFixed(2))))
    }));
  };

  const handlePreviewVoice = async () => {
    if (!audioContextRef.current) return;
    try {
      const buffer = await generateTTS("Esta é uma prévia da voz selecionada.", settings, audioContextRef.current);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      source.start();
    } catch (err) {
      console.error("Preview failed", err);
    }
  };

  // Handlers for individual blocks
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
      const buffer = await generateTTS(block.text, settings, audioContextRef.current);
      const blob = audioBufferToWav(buffer);
      const url = URL.createObjectURL(blob);
      updateBlock(blockId, { 
        audioBuffer: buffer, 
        audioUrl: url, 
        isGenerating: false 
      });
    } catch (err) {
      console.error("Generation failed", err);
      updateBlock(blockId, { isGenerating: false });
    }
  };

  const playSingleAudio = (block: AudioBlock) => {
    if (!block.audioBuffer || !audioContextRef.current) return;
    
    // Stop previous if playing
    currentSourceRef.current?.stop();
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = block.audioBuffer;
    source.playbackRate.value = settings.speed * block.playbackSpeed;
    
    const gainNode = audioContextRef.current.createGain();
    gainNode.gain.value = block.playbackVolume;
    
    source.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);
    
    source.onended = () => {
      if (currentSourceRef.current === source) {
        currentSourceRef.current = null;
      }
    };

    source.start();
    currentSourceRef.current = source;
  };

  // Batch actions
  const generateAll = async () => {
    for (const block of blocks) {
      if (block.text && !block.audioBuffer) {
        await generateSingleAudio(block.id);
      }
    }
  };

  const stopPlayback = () => {
    isStoppingRef.current = true;
    currentSourceRef.current?.stop();
    currentSourceRef.current = null;
    setIsPlayingAll(false);
    setCurrentPlayingIndex(null);
  };

  const playSequential = async () => {
    if (isPlayingAll) {
      stopPlayback();
      return;
    }

    setIsPlayingAll(true);
    isStoppingRef.current = false;
    
    for (let i = 0; i < blocks.length; i++) {
      if (isStoppingRef.current) break;
      
      const block = blocks[i];
      if (block.audioBuffer && audioContextRef.current) {
        setCurrentPlayingIndex(i);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = block.audioBuffer;
        source.playbackRate.value = settings.speed * block.playbackSpeed;
        source.connect(audioContextRef.current.destination);
        
        const playPromise = new Promise<void>((resolve) => {
          source.onended = () => resolve();
        });
        
        source.start();
        currentSourceRef.current = source;
        await playPromise;
      }
    }
    
    if (!isStoppingRef.current) {
      setIsPlayingAll(false);
      setCurrentPlayingIndex(null);
    }
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    blocks.forEach((block, idx) => {
      if (block.audioBuffer) {
        const wavBlob = audioBufferToWav(block.audioBuffer);
        zip.file(`audio_${idx + 1}.wav`, wavBlob);
      }
    });
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = "audios_tts.zip";
    a.click();
  };

  const downloadMerged = () => {
    if (!audioContextRef.current) return;
    const validBuffers = blocks.map(b => b.audioBuffer).filter((b): b is AudioBuffer => b !== null);
    const merged = mergeAudioBuffers(validBuffers, audioContextRef.current);
    if (merged) {
      const blob = audioBufferToWav(merged);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "faixa_unica.wav";
      a.click();
    }
  };

  const clearAll = () => {
    setBlocks([createInitialBlock()]);
    stopPlayback();
  };

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-dark-bg">
      {/* Background elements adjusted for new palette */}
      <div className="fixed inset-0 bg-gradient-to-br from-[#120505] via-dark-bg to-[#0d0d12] -z-10"></div>
      <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] bg-brand-red rounded-full mix-blend-screen filter blur-[100px] opacity-10 animate-float -z-10"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-brand-red-light rounded-full mix-blend-screen filter blur-[120px] opacity-10 animate-float -z-10" style={{ animationDelay: '-3s' }}></div>

      {/* Header Section (Fixed Top) */}
      <header className="relative z-50 glass-card m-4 rounded-2xl p-4 flex flex-col gap-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-brand-red font-bold mb-1">EDSON AUTOMAÇÃO</span>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-red flex items-center justify-center text-white shadow-lg shadow-brand-red/30">
                <Mic2 size={20} />
              </div>
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                Gerador de Áudio TTS
              </span>
            </h1>
          </div>
          <button 
            onClick={clearAll}
            className="glass-btn px-4 py-2 rounded-xl text-xs flex items-center gap-2 text-white/50 hover:text-white transition-colors"
          >
            <RotateCcw size={14} /> Limpar
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button 
            onClick={generateAll}
            className="primary-btn py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold text-white"
          >
            <Zap size={18} fill="white" /> Gerar Todos
          </button>
          <button 
            onClick={playSequential}
            disabled={!blocks.some(b => b.audioBuffer)}
            className="glass-btn py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-50"
          >
            {isPlayingAll ? <Square size={18} className="text-brand-red fill-brand-red" /> : <Play size={18} className="text-white fill-white" />}
            {isPlayingAll ? "Interromper" : "Reproduzir Todos"}
          </button>
          <button 
            onClick={downloadZip}
            disabled={!blocks.some(b => b.audioBuffer)}
            className="glass-btn py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-50"
          >
            <FileArchive size={18} className="text-brand-red" /> Baixar Tudo (.zip)
          </button>
          <button 
            onClick={downloadMerged}
            disabled={!blocks.some(b => b.audioBuffer)}
            className="glass-btn py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-50"
          >
            <Music size={18} className="text-brand-red" /> Baixar Faixa Única
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col md:flex-row gap-4 p-4 min-h-0">
        {/* Left Column (Settings) */}
        <aside className="w-full md:w-80 glass-card rounded-2xl p-6 flex flex-col gap-6 shadow-2xl">
          <div className="space-y-4">
            <label className="text-[10px] uppercase tracking-[0.2em] text-brand-red font-bold flex items-center gap-2 border-b border-brand-red/20 pb-2">
              <Settings size={14} /> Configurações
            </label>
            
            <div className="space-y-2">
              <span className="text-[10px] text-white/40 font-medium">SELECIONAR VOZ</span>
              <div className="flex gap-2">
                <select 
                  value={settings.voice}
                  onChange={(e) => setSettings(s => ({ ...s, voice: e.target.value }))}
                  className="flex-1 glass-input p-3 rounded-xl text-xs bg-dark-bg"
                >
                  {VOICES.map(v => <option key={v} value={v} className="bg-[#1a1a21]">{v}</option>)}
                </select>
                <button 
                  onClick={handlePreviewVoice}
                  className="glass-btn p-3 rounded-xl aspect-square flex items-center justify-center hover:bg-brand-red/20"
                  title="Ouvir Prévia"
                >
                  <Play size={16} fill="white" />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/40 font-medium">RITMO / VELOCIDADE</span>
                <span className="text-[10px] font-bold text-brand-red">{settings.speed.toFixed(2)}x</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => handleSpeedChange(-0.05)} className="glass-btn w-8 h-8 rounded-lg flex items-center justify-center font-bold">-</button>
                <input 
                  type="range" min="0.5" max="3" step="0.05" value={settings.speed}
                  onChange={(e) => setSettings(s => ({ ...s, speed: parseFloat(e.target.value) }))}
                  className="flex-1 accent-brand-red h-1 bg-white/10 rounded-full"
                />
                <button onClick={() => handleSpeedChange(0.05)} className="glass-btn w-8 h-8 rounded-lg flex items-center justify-center font-bold">+</button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/40 font-medium">EXPRESSIVIDADE / TOM</span>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-brand-red/10 text-brand-red">
                  {getToneLabel(settings.temperature).split(':')[1].trim()}
                </span>
              </div>
              <input 
                type="range" min="0" max="3" step="0.1" value={settings.temperature}
                onChange={(e) => setSettings(s => ({ ...s, temperature: parseFloat(e.target.value) }))}
                className="w-full accent-brand-red h-1 bg-white/10 rounded-full"
              />
              <div className="flex justify-between text-[8px] text-white/20 uppercase tracking-tighter">
                <span>Flat</span>
                <span>Balanced</span>
                <span>Expressive</span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] text-white/40 font-medium uppercase">Estilo de Narração</span>
              <textarea 
                value={settings.style}
                onChange={(e) => setSettings(s => ({ ...s, style: e.target.value }))}
                placeholder="Ex: Empolgado, locutor de rádio..."
                className="w-full glass-input p-3 rounded-xl text-xs min-h-[70px] resize-none"
              />
            </div>

            <div className="space-y-2">
              <span className="text-[10px] text-white/40 font-medium uppercase">Sotaque</span>
              <input 
                type="text" value={settings.accent}
                onChange={(e) => setSettings(s => ({ ...s, accent: e.target.value }))}
                placeholder="Ex: Nordestino, Paulistano..."
                className="w-full glass-input p-3 rounded-xl text-xs"
              />
            </div>
          </div>

          <div className="mt-auto pt-4 border-t border-white/5">
             <div className="flex items-center gap-3 text-[9px] text-white/30 uppercase tracking-widest font-bold">
               <div className="w-1.5 h-1.5 rounded-full bg-brand-red animate-pulse"></div>
               Sincronizado com API
             </div>
          </div>
        </aside>

        {/* Right Column (Scrollable Blocks) */}
        <section className="flex-1 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
          {blocks.map((block, index) => (
            <div 
              key={block.id} 
              className={`glass-card p-6 rounded-2xl transition-all duration-300 ${
                currentPlayingIndex === index ? 'border-brand-red/50 bg-brand-red/5 shadow-[0_0_30px_rgba(240,45,78,0.1)]' : ''
              }`}
            >
              <div className="flex flex-col lg:flex-row gap-5">
                <div className="flex-1 flex flex-col space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-brand-red tracking-[0.2em] uppercase">TRECHO {index + 1}</span>
                    {block.audioBuffer && (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
                        <CheckCircle2 size={12} /> PRONTO
                      </div>
                    )}
                  </div>
                  <textarea 
                    value={block.text}
                    onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                    placeholder="O que o narrador deve dizer?"
                    className="flex-1 glass-input p-4 rounded-2xl text-sm min-h-[120px] resize-none focus:ring-0"
                  />
                </div>

                <div className="flex flex-row lg:flex-col gap-2 min-w-[150px]">
                  <button 
                    onClick={() => generateSingleAudio(block.id)}
                    disabled={block.isGenerating || !block.text}
                    className="flex-1 glass-btn p-4 rounded-xl flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest hover:text-brand-red disabled:opacity-30"
                  >
                    {block.isGenerating ? (
                      <div className="w-4 h-4 border-2 border-brand-red/20 border-t-brand-red rounded-full animate-spin" />
                    ) : (
                      <Zap size={14} className="text-brand-red" fill="currentColor" />
                    )}
                    Gerar Áudio
                  </button>
                  <button 
                    onClick={() => insertBlockBelow(block.id)}
                    className="flex-1 glass-btn p-4 rounded-xl flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest"
                  >
                    <Plus size={14} /> Adicionar
                  </button>
                  <button 
                    onClick={() => deleteBlock(block.id)}
                    className="flex-1 glass-btn p-4 rounded-xl flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/30 hover:!text-brand-red hover:!bg-brand-red/10"
                  >
                    <Trash2 size={14} /> Excluir
                  </button>
                </div>
              </div>

              {block.audioUrl && (
                <div className="mt-6 pt-5 border-t border-white/5 flex flex-wrap items-center gap-8 bg-black/20 -mx-6 -mb-6 px-6 py-4 rounded-b-2xl">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => playSingleAudio(block)}
                      className="w-12 h-12 rounded-full primary-btn flex items-center justify-center group"
                    >
                      <Play size={20} fill="white" className="ml-1 group-hover:scale-110 transition-transform" />
                    </button>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-white uppercase tracking-tighter">Ouvir agora</span>
                      <span className="text-[9px] text-white/30 font-medium">Visualizar Narração</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 flex-1 min-w-[180px]">
                    <div className="flex justify-between text-[9px] font-bold text-white/40 uppercase tracking-widest">
                      <span>Volume</span>
                      <span className="text-brand-red">{(block.playbackVolume * 100).toFixed(0)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="1" step="0.1" value={block.playbackVolume}
                      onChange={(e) => updateBlock(block.id, { playbackVolume: parseFloat(e.target.value) })}
                      className="accent-brand-red h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-1 min-w-[100px]">
                    <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Velocidade</span>
                    <select 
                      value={block.playbackSpeed}
                      onChange={(e) => updateBlock(block.id, { playbackSpeed: parseFloat(e.target.value) })}
                      className="bg-transparent text-xs font-bold text-white outline-none border-b border-white/10 cursor-pointer"
                    >
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map(s => <option key={s} value={s} className="bg-[#1a1a21]">{s}x</option>)}
                    </select>
                  </div>

                  <a 
                    href={block.audioUrl} download={`narração_${index+1}.wav`}
                    className="primary-btn px-6 py-3 rounded-full flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white ml-auto"
                  >
                    <Download size={14} /> Download
                  </a>
                </div>
              )}
            </div>
          ))}

          <button 
            onClick={() => setBlocks(prev => [...prev, createInitialBlock()])}
            className="group relative flex flex-col items-center justify-center p-8 rounded-3xl border-2 border-dashed border-white/5 hover:border-brand-red/30 hover:bg-brand-red/5 transition-all duration-300"
          >
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300 group-hover:bg-brand-red group-hover:text-white">
              <Plus size={24} />
            </div>
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-white/20 group-hover:text-white transition-colors">ADICIONAR NOVO MÓDULO DE ÁUDIO</span>
          </button>
        </section>
      </main>

      <footer className="p-4 glass-card mx-4 mb-4 rounded-2xl flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-2 h-2 rounded-full bg-brand-red animate-pulse"></div>
          <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.2em]">ÁREA DE MEMBROS EXCLUSIVA</p>
        </div>
        <p className="text-[10px] text-white/30 font-medium">
           Desenvolvido por <span className="text-brand-red font-bold">Edson Automação</span> <span className="mx-2">•</span> 2024
        </p>
      </footer>
    </div>
  );
}
