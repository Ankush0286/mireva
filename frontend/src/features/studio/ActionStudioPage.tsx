import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Trash2,
  Check,
  X,
  Sliders,
  Sparkles,
  Eye,
  MousePointerClick,
  Upload,
  Type,
  Clock,
  Monitor,
  Compass,
  ArrowLeft,
  ArrowRight,
  Image as ImageIcon,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import {
  api,
  type ActionRecipe,
  type PlatformType,
} from '../../api/client';
import { LoadingState } from '../../components/LoadingState';

const PLATFORMS: Array<{ id: PlatformType; name: string; homeUrl: string; badgeBg: string; badgeText: string }> = [
  { id: 'instagram', name: 'Instagram', homeUrl: 'https://www.instagram.com/', badgeBg: 'bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600', badgeText: 'text-white' },
  { id: 'twitter', name: 'X (Twitter)', homeUrl: 'https://x.com/home', badgeBg: 'bg-black', badgeText: 'text-white' },
  { id: 'facebook', name: 'Facebook', homeUrl: 'https://www.facebook.com/', badgeBg: 'bg-[#1877F2]', badgeText: 'text-white' },
];

function StepTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'click':
      return <MousePointerClick size={13} className="text-[#0E3A75]" />;
    case 'upload':
      return <Upload size={13} className="text-purple-600" />;
    case 'type':
      return <Type size={13} className="text-emerald-600" />;
    case 'wait':
      return <Clock size={13} className="text-amber-600" />;
    default:
      return <Sparkles size={13} className="text-slate-500" />;
  }
}

export const ActionStudioPage: React.FC = () => {
  const [recipes, setRecipes] = useState<ActionRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType | 'all'>('all');

  // UI Modes
  const [inspectingRecipe, setInspectingRecipe] = useState<ActionRecipe | null>(null);
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);
  const [isLiveStudioActive, setIsLiveStudioActive] = useState(false);

  // Studio Setup State
  const [targetPlatform, setTargetPlatform] = useState<PlatformType>('instagram');
  const [recipeName, setRecipeName] = useState('');
  const [currentUrl, setCurrentUrl] = useState('https://www.instagram.com/');
  const [urlInput, setUrlInput] = useState('');

  // Live Stream State
  const [liveSteps, setLiveSteps] = useState<Array<Record<string, any>>>([]);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [hasReceivedFrame, setHasReceivedFrame] = useState(false);
  const [studioStatus, setStudioStatus] = useState('Initializing Chromium session...');
  const [textInputBuffer, setTextInputBuffer] = useState('');
  const [clickRipple, setClickRipple] = useState<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // User-triggered recipe reload (refresh button, after exiting live studio)
  const loadRecipes = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.recipes.list({ active_only: false });
      setRecipes(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load custom workflows.');
    } finally {
      setLoading(false);
    }
  };
  
  // Initial load on mount (no synchronous setState calls in effect body)
  useEffect(() => {
    let isMounted = true;
    api.recipes
      .list({ active_only: false })
      .then((data) => {
        if (isMounted) {
          setRecipes(data);
          setLoading(false);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          setError(err?.message || 'Failed to load custom workflows.');
          setLoading(false);
        }
      });
  
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredRecipes = useMemo(() => {
    return recipes.filter((r) => {
      return selectedPlatform === 'all' || r.platform === selectedPlatform;
    });
  }, [recipes, selectedPlatform]);

  const handleLocalFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !wsRef.current) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = (reader.result as string).split(',')[1];
      wsRef.current?.send(JSON.stringify({ type: 'upload_file', filename: file.name, data: base64Data }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const openLaunchModal = (platform: PlatformType = 'instagram') => {
    setTargetPlatform(platform);
    const pMeta = PLATFORMS.find((p) => p.id === platform);
    setRecipeName(`${pMeta?.name || 'Platform'} Custom Workflow`);
    setIsLaunchModalOpen(true);
  };

  const launchLiveStudio = () => {
    setIsLaunchModalOpen(false);
    setIsLiveStudioActive(true);
    setLiveSteps([]);
    setHasReceivedFrame(false);

    const pMeta = PLATFORMS.find((p) => p.id === targetPlatform);
    const initialUrl = pMeta?.homeUrl || 'https://www.instagram.com/';
    setCurrentUrl(initialUrl);
    setUrlInput(initialUrl);
    setStudioStatus(`Connecting to ${pMeta?.name || 'platform'}...`);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '127.0.0.1:8000' : window.location.host;
    const wsUrl = `${protocol}//${wsHost}/api/v1/recipes/record/ws?platform=${targetPlatform}`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsWsConnected(true);
      setStudioStatus('Launching stealth browser engine...');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'frame' && canvasRef.current) {
          setHasReceivedFrame(true);
          const img = new Image();
          img.onload = () => {
            const ctx = canvasRef.current?.getContext('2d');
            ctx?.drawImage(img, 0, 0, 1280, 800);
          };
          img.src = `data:image/jpeg;base64,${msg.data}`;
        } else if (msg.type === 'status') {
          setStudioStatus(msg.message);
        } else if (msg.type === 'navigated') {
          setCurrentUrl(msg.url);
          setUrlInput(msg.url);
        } else if (msg.type === 'file_chooser') {
          fileInputRef.current?.click();
        } else if (msg.type === 'step') {
          setLiveSteps((prev) => {
            if (msg.step.type === 'upload' && prev.length > 0 && prev[prev.length - 1].type === 'upload') {
              return prev;
            }
            return [...prev, msg.step];
          });
        }
      } catch (err) {
        console.debug('Frame parsing error:', err);
      }
    };

    ws.onerror = () => setStudioStatus('Connection failed. Ensure backend is running.');
    ws.onclose = () => setIsWsConnected(false);
  };

  const exitLiveStudio = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setIsWsConnected(false);
    setHasReceivedFrame(false);
    setIsLiveStudioActive(false);
    loadRecipes();
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    canvasRef.current?.focus();
    if (!canvasRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const cw = canvas.width;
    const ch = canvas.height;
    const canvasAspect = cw / ch;
    const rectAspect = rect.width / rect.height;

    let renderWidth = rect.width;
    let renderHeight = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (rectAspect > canvasAspect) {
      renderWidth = rect.height * canvasAspect;
      offsetX = (rect.width - renderWidth) / 2;
    } else {
      renderHeight = rect.width / canvasAspect;
      offsetY = (rect.height - renderHeight) / 2;
    }

    const clickX = e.clientX - rect.left - offsetX;
    const clickY = e.clientY - rect.top - offsetY;

    if (clickX < 0 || clickX > renderWidth || clickY < 0 || clickY > renderHeight) return;

    const scaleX = cw / renderWidth;
    const scaleY = ch / renderHeight;
    const targetX = Math.round(clickX * scaleX);
    const targetY = Math.round(clickY * scaleY);

    setClickRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setTimeout(() => setClickRipple(null), 400);

    wsRef.current.send(JSON.stringify({ type: 'click', x: targetX, y: targetY }));
  };

  // Physical Keyboard Listener with Clipboard Paste (Ctrl+V) and Select All (Ctrl+A)
  const handleCanvasKeyDown = async (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Handle Ctrl+V / Cmd+V (Paste)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          wsRef.current.send(JSON.stringify({ type: 'type', text }));
        }
      } catch {
        // Handled by onPaste fallback
      }
      return;
    }

    // Handle Ctrl+A / Cmd+A (Select All)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      wsRef.current.send(JSON.stringify({ type: 'key', key: 'ControlOrMeta+A' }));
      return;
    }

    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
      e.preventDefault();
    }

    if (['Backspace', 'Delete', 'Enter', 'Tab', 'Escape'].includes(e.key) || e.key.startsWith('Arrow')) {
      wsRef.current.send(JSON.stringify({ type: 'key', key: e.key }));
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      wsRef.current.send(JSON.stringify({ type: 'type', text: e.key }));
    }
  };

  // Clipboard Paste Event Listener
  const handleCanvasPaste = (e: React.ClipboardEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    if (pastedText && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'type', text: pastedText }));
    }
  };

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: 'navigate', url: urlInput.trim() }));
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInputBuffer.trim() || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: 'type', text: textInputBuffer }));
    setTextInputBuffer('');
  };

  const handleSaveLiveRecipe = async () => {
    if (!recipeName.trim()) return showToast('Please name this workflow.');
    if (liveSteps.length === 0) return showToast('No steps captured yet.');

    try {
      const created = await api.recipes.create({
        name: recipeName.trim(),
        platform: targetPlatform,
        is_default: false,
        steps: liveSteps,
      });
      setRecipes((prev) => [created, ...prev]);
      exitLiveStudio();
      showToast(`Custom workflow "${created.name}" saved successfully!`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to save workflow.');
    }
  };

  const handleDeleteRecipe = async (recipe: ActionRecipe) => {
    if (!window.confirm(`Delete custom workflow "${recipe.name}"?`)) return;
    try {
      await api.recipes.delete(recipe.id);
      setRecipes((prev) => prev.filter((r) => r.id !== recipe.id));
      showToast(`Workflow "${recipe.name}" deleted.`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete workflow.');
    }
  };

  // =========================================================================
  // VIEW A: LIVE STUDIO WORKSPACE
  // =========================================================================
  if (isLiveStudioActive) {
    const pMeta = PLATFORMS.find((p) => p.id === targetPlatform);
    return (
      <div className="relative h-full w-full flex flex-col font-sans select-none overflow-hidden bg-slate-900 rounded-[20px] shadow-2xl border border-slate-700">
        <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleLocalFileChosen} className="hidden" />

        <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-700 flex items-center justify-between shrink-0 text-white">
          <div className="flex items-center gap-3">
            <button onClick={exitLiveStudio} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-white transition-colors cursor-pointer">
              <ArrowLeft size={14} /><span>Exit Studio</span>
            </button>
            <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold ${pMeta?.badgeBg} ${pMeta?.badgeText}`}>{pMeta?.name}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase flex items-center gap-1 ${isWsConnected ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-700 text-slate-400'}`}>
              {isWsConnected ? '🔴 Recording Live' : 'Connecting...'}
            </span>
          </div>

          <form onSubmit={handleNavigate} className="flex-1 max-w-xl mx-4 flex items-center gap-1.5">
            <div className="flex-1 flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-slate-300">
              <Compass size={13} className="text-blue-400 shrink-0" />
              <input type="text" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} className="w-full bg-transparent text-xs text-white outline-none" />
            </div>
            <button type="submit" className="px-3 py-1 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer">Go</button>
          </form>
          <span className="text-xs font-bold text-slate-300 truncate max-w-xs">{recipeName}</span>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 bg-black flex flex-col items-center justify-center relative overflow-hidden p-2">
            {!hasReceivedFrame && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-black text-white">
                <LoadingState label={studioStatus} variant="Orbit" />
                <span className="text-xs text-slate-400 font-mono">Streaming {currentUrl}...</span>
              </div>
            )}

            <div className="relative w-full h-full max-w-full max-h-full flex items-center justify-center">
              <canvas
                ref={canvasRef}
                tabIndex={0}
                width={1280}
                height={800}
                onClick={handleCanvasClick}
                onKeyDown={handleCanvasKeyDown}
                onPaste={handleCanvasPaste}
                className={`max-w-full max-h-full object-contain cursor-crosshair outline-none transition-opacity duration-300 ${hasReceivedFrame ? 'opacity-100' : 'opacity-0'}`}
              />
              {clickRipple && (
                <div className="absolute w-5 h-5 rounded-full bg-blue-500/60 border-2 border-white pointer-events-none animate-ping z-30" style={{ left: `${clickRipple.x - 10}px`, top: `${clickRipple.y - 10}px` }} />
              )}
            </div>

            <div className="absolute bottom-3 inset-x-8 max-w-lg mx-auto flex items-center gap-2 p-1.5 rounded-2xl bg-white/95 backdrop-blur-md border border-[#DCE7F5] shadow-xl z-20">
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EBF3FC] text-[#0E3A75] text-xs font-semibold shrink-0 shadow-2xs cursor-pointer">
                <ImageIcon size={14} /><span>Upload Media</span>
              </button>
              <form onSubmit={handleSendText} className="flex-1 flex items-center gap-1.5">
                <input type="text" value={textInputBuffer} onChange={(e) => setTextInputBuffer(e.target.value)} placeholder="Or paste text here..." className="flex-1 px-2.5 py-1 text-xs font-medium text-[#09122A] bg-transparent outline-none" />
                <button type="submit" className="px-3 py-1.5 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold shadow-xs shrink-0 cursor-pointer">Send</button>
              </form>
            </div>
          </div>

          <div className="w-80 md:w-96 border-l border-slate-700 bg-slate-900 flex flex-col justify-between overflow-hidden text-white">
            <div className="p-4 border-b border-slate-800 bg-slate-800/60">
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Workflow Name</label>
              <input type="text" value={recipeName} onChange={(e) => setRecipeName(e.target.value)} className="w-full h-9 px-3 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white focus:outline-none focus:border-blue-500" />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                <span>Recorded Steps ({liveSteps.length})</span>
                {liveSteps.length > 0 && <button onClick={() => setLiveSteps([])} className="text-rose-400 hover:underline cursor-pointer">Clear</button>}
              </div>

              {liveSteps.length === 0 ? (
                <div className="p-6 rounded-2xl bg-slate-800/40 border border-slate-800 text-center text-xs text-slate-400">
                  <MousePointerClick size={24} className="mx-auto mb-2 text-blue-400 opacity-60" />
                  <span>Click anywhere on the web page to capture custom actions!</span>
                </div>
              ) : (
                liveSteps.map((step, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 shadow-sm text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-white">
                        <span className="font-mono text-[10px] text-slate-400">#{idx + 1}</span>
                        <StepTypeIcon type={step.type} />
                        <span className="uppercase text-[11px]">{step.type}</span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-300 truncate max-w-[120px]">{step.description || ''}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-800/60 space-y-2">
              <button onClick={handleSaveLiveRecipe} className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md cursor-pointer">
                Save Custom Workflow ({liveSteps.length} Steps)
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW B: CUSTOM RECIPE REPOSITORY
  // =========================================================================
  return (
    <div className="relative h-full overflow-y-auto px-3 sm:px-6 py-4 custom-scrollbar max-w-6xl mx-auto w-full font-sans select-none text-[#09122A]">
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#0E3A75] text-white text-xs font-semibold shadow-2xl animate-fade-up-1">
          <Check size={15} className="text-emerald-400" strokeWidth={3} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 border border-[#DCE7F5] text-[11px] font-bold uppercase tracking-wider text-[#0E3A75] mb-2 shadow-2xs">
            <Sliders size={11} />
            <span>Custom Workflows Studio</span>
          </div>
          <h1 className="text-[30px] sm:text-[36px] font-bold tracking-[-0.025em] text-[#09122A] leading-tight">
            Custom Automations
          </h1>
          <p className="text-[13.5px] text-[#475569] mt-1">
            Build and test unique browser recipes like story engagement, bulk liking, or following target audiences.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button onClick={loadRecipes} title="Refresh workflows" className="w-9 h-9 rounded-xl bg-white border border-[#DCE7F5] hover:bg-slate-50 text-slate-600 flex items-center justify-center shadow-2xs cursor-pointer">
            <RefreshCw size={14} className={loading ? 'animate-spin text-[#0E3A75]' : ''} />
          </button>
          <button
            type="button"
            onClick={() => openLaunchModal('instagram')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-semibold shadow-md transition-all cursor-pointer hover:scale-[1.01] active:scale-95"
          >
            <Monitor size={15} strokeWidth={2.4} />
            <span>Record New Workflow</span>
          </button>
        </div>
      </div>

      {/* 2. Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-2 rounded-2xl bg-white/80 border border-[#DCE7F5]">
        <div className="flex items-center gap-1">
          <button onClick={() => setSelectedPlatform('all')} className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${selectedPlatform === 'all' ? 'bg-[#EBF3FC] text-[#0E3A75]' : 'text-slate-500'}`}>All Platforms</button>
          {PLATFORMS.map((p) => (
            <button key={p.id} onClick={() => setSelectedPlatform(p.id)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${selectedPlatform === p.id ? 'bg-[#EBF3FC] text-[#0E3A75]' : 'text-slate-500'}`}>
              {p.name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle size={15} /><span>{error}</span>
        </div>
      )}

      {/* 3. Grid */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <LoadingState label="Loading custom workflows" variant="Orbit" />
        </div>
      ) : filteredRecipes.length === 0 ? (
        <div className="rounded-[24px] bg-white/95 border border-[#DCE7F5] p-10 text-center shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center mx-auto mb-3">
            <Sliders size={24} />
          </div>
          <h2 className="text-lg font-bold text-[#09122A]">No custom workflows yet</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
            Default posts, DMs, and scrapers are handled natively. Use this studio to record custom interactions (e.g. Story Engager, Audience Follower).
          </p>
          <button onClick={() => openLaunchModal('instagram')} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0E3A75] text-white text-xs font-semibold shadow-xs cursor-pointer">
            <Monitor size={14} /><span>Record First Workflow</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-8">
          {filteredRecipes.map((recipe) => {
            const pMeta = PLATFORMS.find((p) => p.id === recipe.platform) || PLATFORMS[0];
            return (
              <div key={recipe.id} className="rounded-[22px] bg-white/95 border border-[#DCE7F5] p-5 shadow-sm flex flex-col justify-between hover:border-[#B8D0EC] transition-all">
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold ${pMeta.badgeBg} ${pMeta.badgeText}`}>{pMeta.name}</span>
                        <span className="px-2 py-0.5 rounded-md bg-[#F1F5F9] text-slate-700 text-[10.5px] font-bold uppercase tracking-wider">Custom</span>
                      </div>
                      <h3 className="text-[16px] font-bold text-[#09122A]">{recipe.name}</h3>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#F8FAFD] border border-[#EBF2FA] mb-4">
                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 mb-2">
                      <span className="font-bold text-[#0E3A75]">{recipe.steps?.length || 0} Steps</span>
                      <span>Resilient Fallbacks Enabled</span>
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                      {recipe.steps?.slice(0, 7).map((step, idx) => (
                        <div key={idx} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-[#DCE7F5] text-[10.5px] font-mono shrink-0 shadow-2xs">
                          <StepTypeIcon type={step.type} />
                          <span className="truncate max-w-[80px]">{step.description || step.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[#F0F5FA]">
                  <span className="text-[11px] font-mono text-slate-400">Updated {new Date(recipe.updated_at).toLocaleDateString()}</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setInspectingRecipe(recipe)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#F1F4F9] hover:bg-[#E4EBF5] text-xs font-semibold text-[#09122A] cursor-pointer">
                      <Eye size={12} /><span>Inspect</span>
                    </button>
                    <button onClick={() => handleDeleteRecipe(recipe)} className="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center cursor-pointer transition-colors" title="Delete workflow">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Pre-flight Launch Modal */}
      {isLaunchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#09122A]/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setIsLaunchModalOpen(false); }}>
          <div className="w-full max-w-md rounded-[26px] bg-white border border-[#DCE7F5] shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-[#F0F5FA]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#EBF3FC] text-[#0E3A75] flex items-center justify-center">
                  <Monitor size={17} />
                </div>
                <div>
                  <h3 className="font-bold text-[16px] text-[#09122A]">Launch Live Studio</h3>
                  <span className="text-xs text-slate-400">Select target platform</span>
                </div>
              </div>
              <button onClick={() => setIsLaunchModalOpen(false)} className="w-8 h-8 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"><X size={15} /></button>
            </div>

            <div className="py-5 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {PLATFORMS.map((p) => {
                  const selected = targetPlatform === p.id;
                  return (
                    <button key={p.id} onClick={() => { setTargetPlatform(p.id); setRecipeName(`${p.name} Custom Workflow`); }} className={`p-3 rounded-2xl border flex items-center gap-2.5 text-xs font-bold transition-all cursor-pointer ${selected ? 'bg-[#F4F9FF] border-[#0E3A75] text-[#0E3A75]' : 'bg-white border-[#DCE7F5] text-slate-600'}`}>
                      <span className={`w-3 h-3 rounded-full ${p.badgeBg}`} /><span>{p.name}</span>
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#09122A] mb-1">Custom Workflow Name</label>
                <input type="text" value={recipeName} onChange={(e) => setRecipeName(e.target.value)} className="w-full h-10 px-3.5 rounded-xl bg-[#F8FAFD] border border-[#DCE7F5] text-xs font-medium focus:border-[#0E3A75] outline-none" />
              </div>
            </div>

            <div className="pt-3 border-t border-[#F0F5FA] flex justify-end gap-2">
              <button onClick={() => setIsLaunchModalOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer">Cancel</button>
              <button onClick={launchLiveStudio} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-semibold shadow-xs cursor-pointer">
                <span>Launch Studio</span><ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Step Inspector Modal */}
      {inspectingRecipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#09122A]/40 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setInspectingRecipe(null); }}>
          <div className="w-full max-w-2xl rounded-[26px] bg-white border border-[#DCE7F5] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F5FA] bg-[#F8FBFF]">
              <div>
                <h3 className="font-bold text-[16px] text-[#09122A]">{inspectingRecipe.name}</h3>
                <span className="text-xs text-slate-400">{inspectingRecipe.steps?.length || 0} automated execution steps</span>
              </div>
              <button onClick={() => setInspectingRecipe(null)} className="w-8 h-8 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"><X size={15} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
              {inspectingRecipe.steps?.map((step, idx) => (
                <div key={idx} className="p-3.5 rounded-2xl bg-[#F8FAFD] border border-[#E2ECF7] text-xs">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-[#EBF3FC] font-mono text-[10px] font-bold text-[#0E3A75]">#{idx + 1}</span>
                    <span className="font-bold text-[#09122A] uppercase tracking-wide flex items-center gap-1.5"><StepTypeIcon type={step.type} />{step.type}</span>
                    <span className="text-slate-500 font-medium">— {step.description}</span>
                  </div>
                  {step.selectors && (
                    <div className="mt-2 space-y-0.5">
                      {step.selectors.map((sel: string, sIdx: number) => (
                        <div key={sIdx} className="px-2 py-1 rounded-lg bg-white border border-[#DCE7F5] font-mono text-[10.5px] text-[#0E3A75] truncate">{sel}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="px-6 py-3.5 border-t border-[#F0F5FA] bg-[#F8FBFF] flex justify-end">
              <button onClick={() => setInspectingRecipe(null)} className="px-4 py-2 rounded-xl bg-[#0E3A75] hover:bg-[#092854] text-white text-xs font-semibold cursor-pointer">Close Inspector</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActionStudioPage;