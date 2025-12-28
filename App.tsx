
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import { GameState, Difficulty, Cup, Ball, Vector2D } from './types';
import { getCommentary } from './services/geminiService';

interface DynamicCup extends Cup {
  baseX: number;
  baseY: number;
  color: string;
  phase: number;
  speed: number;
  amp: number;
  zScale: number; 
}

const ConfettiParticle: React.FC<{ delay: number; color: string; left: string }> = ({ delay, color, left }) => (
  <div 
    className="absolute top-[-20px] w-3 h-3 rounded-sm animate-confetti-fall"
    style={{ 
      backgroundColor: color, 
      left, 
      animationDelay: `${delay}s`,
      opacity: 0.8
    }}
  />
);

const App: React.FC = () => {
  // --- UI STATE ---
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [score, setScore] = useState(0); 
  const [ballsLeft, setBallsLeft] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium');
  const [currentLevel, setCurrentLevel] = useState(1);
  const [unlockedLevel, setUnlockedLevel] = useState<number>(() => {
    const saved = localStorage.getItem('steph_toss_unlocked_level');
    return saved ? parseInt(saved, 10) : 1;
  });
  const [selectedColor] = useState('#f43f5e');
  const [commentary, setCommentary] = useState("Step right up! Test your skill!");
  const [toast, setToast] = useState<{ message: string, x: number, y: number } | null>(null);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);
  const [countdown, setCountdown] = useState<number | string>(3);
  const [mysteryTarget, setMysteryTarget] = useState<number | null>(null);
  const [isRevealingGift, setIsRevealingGift] = useState(false);
  
  // --- GAME STATS FOR RESULTS ---
  const [stats, setStats] = useState({ hits: 0, jackpots: 0, totalTossed: 0 });

  // --- PHYSICS & RENDERING REFS ---
  const scoreRef = useRef(0);
  const ballsLeftRef = useRef(10);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cupsRef = useRef<DynamicCup[]>([]);
  const ballRef = useRef<Ball | null>(null);
  const dragStartRef = useRef<Vector2D | null>(null);
  const dragCurrentRef = useRef<Vector2D | null>(null);
  const requestRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  // --- CONSTANTS ---
  const WIDTH = 800;
  const HEIGHT = 600;
  const TABLE_TOP_Y = 220;
  const TABLE_FRONT_Y = 500;
  const TABLE_TOP_WIDTH = 480;
  const TABLE_BOTTOM_WIDTH = 1150;
  const BASE_CUP_WIDTH = 55; 
  const BASE_CUP_HEIGHT = 80;
  const SLING_START = { x: 400, y: 550 };
  const GRAVITY = 0.42; 
  const FRICTION_AIR = 0.998; 
  const FRICTION_GROUND = 0.92; 
  const BOUNCE = 0.55;    
  const STOP_THRESHOLD = 0.25;
  const MAX_POWER = 55; 
  const POWER_SENSITIVITY = 0.28; 

  const THEMES = [
    "Lush Tropical Forest Path",
    "Ancient Sand Temple Interior",
    "Misty Blue Mountain Peak",
    "Golden Harvest Farm",
    "Enchanted Crystal Cave",
    "Sunset Pier Carnival",
    "Deep Jungle Ruins",
    "Cyber City Night Alley",
    "Underwater Coral Garden",
    "Palatial Royal Garden"
  ];

  // LOGIC: Level 1 needs 500, Level 2 needs 1000...
  // BUT for Easy, we use a "Gift" target.
  const getTargetScore = useCallback((level: number, diff: Difficulty) => {
    if (diff === 'Easy') {
      return mysteryTarget || 300; // Fallback
    }
    const factor = diff === 'Medium' ? 750 : 1250;
    return level * factor;
  }, [mysteryTarget]);

  const currentGoal = getTargetScore(currentLevel, difficulty);
  const targetMet = score >= currentGoal;

  // PERSIST PROGRESSION
  useEffect(() => {
    localStorage.setItem('steph_toss_unlocked_level', unlockedLevel.toString());
  }, [unlockedLevel]);

  // --- BACKGROUND GENERATION ---
  const generateBackground = useCallback(async (level: number) => {
    setIsGeneratingBg(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const theme = THEMES[(level - 1) % THEMES.length];
      const prompt = `A soft, blurred, high-quality 2D casual game background. Theme: ${theme}. Professional mobile game environment art, vibrant colors, clear foreground area for gameplay. No characters. 16:9 perspective.`;
      
      const imgResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio: "16:9" } }
      });

      for (const part of imgResponse.candidates[0].content.parts) {
        if (part.inlineData) {
          setBgImage(`data:image/png;base64,${part.inlineData.data}`);
          break;
        }
      }
    } catch (error: any) {
      console.error("Background Generation Error:", error);
    } finally {
      setIsGeneratingBg(false);
    }
  }, []);

  useEffect(() => {
    generateBackground(currentLevel);
  }, [currentLevel, generateBackground]);

  const initCups = useCallback((level: Difficulty, stage: number) => {
    const count = level === 'Easy' ? 10 : level === 'Medium' ? 7 : 5;
    const tempCups: DynamicCup[] = [];
    
    for (let i = 0; i < count; i++) {
      let depth = 0.2;
      let xOffset = 0;

      switch(stage % 5) {
        case 1: 
          depth = (i / count) * 0.4 + 0.1;
          xOffset = (i - (count-1)/2) * 80;
          break;
        case 2: 
          const half = (count - 1) / 2;
          depth = 0.1 + (Math.abs(i - half) * 0.15);
          xOffset = (i - half) * 90;
          break;
        case 3: 
          if (i === 0) { depth = 0.1; xOffset = 0; }
          else if (i < 3) { depth = 0.25; xOffset = (i === 1 ? -60 : 60); }
          else { depth = 0.45; xOffset = (i - 4) * 80; }
          break;
        case 4: 
          depth = 0.1 + Math.random() * 0.4;
          xOffset = (Math.random() - 0.5) * 400;
          break;
        case 0: 
          depth = (i % 2 === 0 ? 0.15 : 0.4);
          xOffset = (i - (count-1)/2) * 110;
          break;
        default:
          depth = 0.1 + (i * 0.08);
          xOffset = 0;
      }

      const zScale = 0.55 + (depth * 0.45); 
      const yPos = TABLE_TOP_Y + (TABLE_FRONT_Y - TABLE_TOP_Y) * depth;
      const xPos = WIDTH / 2 + xOffset * zScale - (BASE_CUP_WIDTH * zScale / 2);
      
      let val = 10; let label = "$10"; let color = selectedColor;
      if (i === 0 || (count > 5 && i === count - 1)) {
        val = 100 + (stage * 20); label = "JACKPOT"; color = '#fbbf24'; 
      } else if (i % 2 === 0) {
        val = 25 + (stage * 5); label = `$${val}`; 
      }
      
      tempCups.push({
        id: i, baseX: xPos, baseY: yPos, x: xPos, y: yPos, width: BASE_CUP_WIDTH * zScale, height: BASE_CUP_HEIGHT * zScale,
        label: label, value: val, type: 'money', color: color, phase: Math.random() * Math.PI * 2,
        speed: (level === 'Easy' ? 0.6 : 1.5) * (0.8 + Math.random() * 0.4) * (1 + (stage * 0.04)),
        amp: (level === 'Easy' ? 10 : 35) * (0.8 + Math.random() * 0.4) * (1 + (stage * 0.04)), zScale: zScale
      });
    }
    tempCups.sort((a, b) => a.y - b.y);
    cupsRef.current = tempCups;
  }, [selectedColor]);

  useEffect(() => {
    initCups(difficulty, currentLevel);
  }, [difficulty, currentLevel, initCups]);

  const triggerCommentary = async (type: 'hit' | 'miss' | 'gameover') => {
    const text = await getCommentary(type, scoreRef.current, ballsLeftRef.current);
    setCommentary(text);
  };

  const showToast = (message: string, x: number, y: number) => {
    setToast({ message, x, y });
    setTimeout(() => setToast(null), 1500);
  };

  const revealGift = () => {
    setIsRevealingGift(true);
    // Random target for Easy mode based on level
    const base = 250 + (currentLevel * 150);
    const variance = Math.floor(Math.random() * 300);
    const target = Math.round((base + variance) / 50) * 50;
    
    setTimeout(() => {
      setMysteryTarget(target);
      setIsRevealingGift(false);
    }, 2000);
  };

  const startCountdown = () => {
    setStats({ hits: 0, jackpots: 0, totalTossed: 0 });
    setScore(0);
    scoreRef.current = 0;
    setGameState(GameState.COUNTDOWN);
    let count = 3;
    setCountdown(count);
    const interval = setInterval(() => {
      count -= 1;
      if (count === 0) {
        setCountdown("GO!");
      } else if (count < 0) {
        clearInterval(interval);
        startGame();
      } else {
        setCountdown(count);
      }
    }, 1000);
  };

  const startGame = () => {
    const startBalls = difficulty === 'Easy' ? 15 : difficulty === 'Medium' ? 10 : 5;
    ballsLeftRef.current = startBalls; 
    setBallsLeft(startBalls);
    setGameState(GameState.AIMING);
    setCommentary(`Mission Goal: $${currentGoal}!`);
    startTimeRef.current = Date.now();
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (gameState !== GameState.AIMING) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pos = { x: (e.clientX - rect.left) * (WIDTH / rect.width), y: (e.clientY - rect.top) * (HEIGHT / rect.height) };
    dragStartRef.current = pos; dragCurrentRef.current = pos;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragCurrentRef.current = { x: (e.clientX - rect.left) * (WIDTH / rect.width), y: (e.clientY - rect.top) * (HEIGHT / rect.height) };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragStartRef.current || !dragCurrentRef.current) return;
    const dx = dragStartRef.current.x - dragCurrentRef.current.x;
    const dy = dragStartRef.current.y - dragCurrentRef.current.y;
    const vx = Math.min(Math.max(dx * POWER_SENSITIVITY, -MAX_POWER), MAX_POWER) * 2.1;
    const vy = Math.min(Math.max(dy * POWER_SENSITIVITY, -MAX_POWER), MAX_POWER) * 2.4; 
    if (Math.abs(vx) > 0.5 || Math.abs(vy) > 0.5) {
      ballRef.current = { x: SLING_START.x, y: SLING_START.y, vx, vy, radius: 10, inCup: false, active: true };
      ballsLeftRef.current -= 1; setBallsLeft(ballsLeftRef.current);
      setStats(prev => ({ ...prev, totalTossed: prev.totalTossed + 1 }));
      setGameState(GameState.THROWN);
    }
    dragStartRef.current = null; dragCurrentRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const handleScore = useCallback((cup: DynamicCup) => {
    if (!ballRef.current) return;
    ballRef.current.active = false; ballRef.current.inCup = true;
    scoreRef.current += cup.value; setScore(scoreRef.current);
    
    setStats(prev => ({
      ...prev,
      hits: prev.hits + 1,
      jackpots: prev.jackpots + (cup.value >= 100 ? 1 : 0)
    }));

    showToast(`+$${cup.value}`, cup.x + cup.width/2, cup.y - 40);
    triggerCommentary('hit');
    setTimeout(() => {
      if (ballsLeftRef.current > 0) setGameState(GameState.AIMING);
      else {
        // CHECK UNLOCK CONDITION
        const needed = getTargetScore(currentLevel, difficulty);
        if (scoreRef.current >= needed && currentLevel === unlockedLevel && unlockedLevel < 10) {
          setUnlockedLevel(prev => prev + 1);
        }
        setGameState(GameState.GAMEOVER);
        triggerCommentary('gameover');
      }
    }, 1200);
  }, [difficulty, currentLevel, unlockedLevel, getTargetScore]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const elapsed = Date.now() - startTimeRef.current;
    
    ctx.clearRect(0,0, WIDTH, HEIGHT);
    
    if (gameState !== GameState.AIMING && gameState !== GameState.THROWN) {
       ctx.fillStyle = 'rgba(0,0,0,0.75)';
       ctx.fillRect(0,0, WIDTH, HEIGHT);
       return;
    }

    ctx.fillStyle = '#010103';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    
    ctx.save();
    const woodGrad = ctx.createLinearGradient(0, TABLE_TOP_Y, 0, TABLE_FRONT_Y);
    woodGrad.addColorStop(0, '#1a0d0a'); woodGrad.addColorStop(1, '#2d1814');
    ctx.fillStyle = woodGrad; ctx.beginPath();
    ctx.moveTo(WIDTH/2 - TABLE_TOP_WIDTH/2, TABLE_TOP_Y); ctx.lineTo(WIDTH/2 + TABLE_TOP_WIDTH/2, TABLE_TOP_Y);
    ctx.lineTo(WIDTH/2 + TABLE_BOTTOM_WIDTH/2, TABLE_FRONT_Y); ctx.lineTo(WIDTH/2 - TABLE_BOTTOM_WIDTH/2, TABLE_FRONT_Y);
    ctx.closePath(); ctx.fill(); ctx.restore();

    ctx.fillStyle = '#100605';
    ctx.fillRect(WIDTH/2 - TABLE_BOTTOM_WIDTH/2, TABLE_FRONT_Y, TABLE_BOTTOM_WIDTH, 20);

    cupsRef.current.forEach(cup => {
      cup.x = cup.baseX + Math.sin((elapsed / 1000) * cup.speed + cup.phase) * cup.amp;
      const cx = cup.x, cy = cup.y, cw = cup.width, ch = cup.height;
      
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.filter = `blur(${3 + 5 * cup.zScale}px)`;
      ctx.beginPath(); ctx.ellipse(cx + cw/2 + 2, cy + ch - 2, (cw/2 + 6), 8 * cup.zScale, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      ctx.save();
      let bodyGrad = ctx.createLinearGradient(cx, 0, cx + cw, 0);
      bodyGrad.addColorStop(0, cup.color); bodyGrad.addColorStop(0.2, 'rgba(255,255,255,0.3)');
      bodyGrad.addColorStop(0.5, cup.color); bodyGrad.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = bodyGrad; ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.bezierCurveTo(cx, cy + ch, cx + 15*cup.zScale, cy + ch, cx + 15*cup.zScale, cy + ch);
      ctx.lineTo(cx + cw - 15*cup.zScale, cy + ch); ctx.bezierCurveTo(cx + cw - 15*cup.zScale, cy + ch, cx + cw, cy + ch, cx + cw, cy);
      ctx.closePath(); ctx.fill();
      
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4 * cup.zScale; ctx.beginPath(); 
      ctx.ellipse(cx + cw/2, cy, cw/2, 10 * cup.zScale, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      
      ctx.save(); ctx.fillStyle = '#ffffff'; ctx.font = `bold ${Math.round(16 * cup.zScale)}px "Inter", sans-serif`;
      ctx.textAlign = 'center'; ctx.shadowColor = 'black'; ctx.shadowBlur = 4;
      ctx.fillText(cup.label, cx + cw/2, cy - 15); ctx.restore();
    });

    if (dragStartRef.current && dragCurrentRef.current) {
      const dx = dragStartRef.current.x - dragCurrentRef.current.x;
      const dy = dragStartRef.current.y - dragCurrentRef.current.y;
      ctx.save(); ctx.setLineDash([4, 12]); ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; ctx.beginPath();
      let sX = SLING_START.x, sY = SLING_START.y, sVX = dx * POWER_SENSITIVITY * 2.1, sVY = dy * POWER_SENSITIVITY * 2.4;
      ctx.moveTo(sX, sY);
      for(let i=0; i<60; i++) {
        sX += sVX; sVY += GRAVITY; sVX *= FRICTION_AIR; sY += sVY; ctx.lineTo(sX, sY);
        if(sY > HEIGHT) break;
      }
      ctx.stroke(); ctx.restore();
    }

    if (ballRef.current && ballRef.current.active) {
      const b = ballRef.current;
      b.vy += GRAVITY; b.vx *= FRICTION_AIR; b.x += b.vx; b.y += b.vy;
      
      if (b.vy > 0) {
        const hitZone = difficulty === 'Easy' ? 32 : 24;
        for (const cup of cupsRef.current) {
          if (Math.abs(b.y - cup.y) < 15 && b.x >= cup.x - hitZone && b.x <= cup.x + cup.width + hitZone) {
            handleScore(cup); break;
          }
        }
      }
      
      const isOverTable = b.x > (WIDTH/2 - TABLE_BOTTOM_WIDTH/2) && b.x < (WIDTH/2 + TABLE_BOTTOM_WIDTH/2);
      const surfaceY = (isOverTable && b.y < TABLE_FRONT_Y + 10) ? TABLE_FRONT_Y - 5 : HEIGHT;
      
      if (b.y > surfaceY - b.radius) { 
        b.y = surfaceY - b.radius; b.vy *= -BOUNCE; b.vx *= FRICTION_GROUND; b.vy *= FRICTION_GROUND; 
      }
      if (b.x < b.radius || b.x > WIDTH - b.radius) { 
        b.vx *= -BOUNCE; b.x = b.x < b.radius ? b.radius : WIDTH - b.radius; 
      }
      
      if (Math.sqrt(b.vx**2 + b.vy**2) < STOP_THRESHOLD && b.y > TABLE_TOP_Y) {
        b.active = false; triggerCommentary('miss');
        setTimeout(() => {
          if (ballsLeftRef.current > 0) setGameState(GameState.AIMING);
          else {
            if (scoreRef.current >= currentGoal && currentLevel === unlockedLevel && unlockedLevel < 10) {
               setUnlockedLevel(prev => prev + 1);
            }
            setGameState(GameState.GAMEOVER); triggerCommentary('gameover');
          }
        }, 800);
      }
      
      ctx.save();
      const ballGrad = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, 11);
      ballGrad.addColorStop(0, '#ffffff'); ballGrad.addColorStop(1, '#fbbf24');
      ctx.fillStyle = ballGrad; ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    } else if (gameState === GameState.AIMING) {
      ctx.save(); ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(SLING_START.x, SLING_START.y, 10, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }, [gameState, difficulty, handleScore, currentLevel, unlockedLevel, currentGoal]);

  useEffect(() => {
    const loop = () => { draw(); requestRef.current = requestAnimationFrame(loop); };
    requestRef.current = requestAnimationFrame(loop);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [draw]);

  const confettiItems = useMemo(() => {
    return Array.from({ length: 45 }).map((_, i) => ({
      delay: Math.random() * 2,
      left: `${Math.random() * 100}%`,
      color: ['#FF6B6B', '#fbbf24', '#5EB6E6', '#f43f5e', '#ffffff'][Math.floor(Math.random() * 5)]
    }));
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-stretch justify-stretch font-sans select-none overflow-hidden"
      style={{ 
        backgroundImage: bgImage ? `url(${bgImage})` : 'none', 
        backgroundSize: 'cover', 
        backgroundPosition: 'center', 
        backgroundColor: '#FFF8F0' 
      }}>
      
      {/* HUD (Gameplay only) */}
      {(gameState === GameState.AIMING || gameState === GameState.THROWN) && (
        <div className="absolute top-0 left-0 right-0 p-8 flex justify-between items-start z-[100] pointer-events-none">
          <div className="flex flex-col gap-4 pointer-events-auto">
            <div className="flex items-center bg-white/95 backdrop-blur-md border-2 border-[#E6935E] rounded-[2.5rem] px-8 py-5 shadow-[0_10px_0_#8B4513]">
              <div className="w-14 h-14 bg-yellow-400 rounded-2xl border-2 border-[#8B4513] flex items-center justify-center mr-5 shadow-inner">
                <span className="text-[#8B4513] font-black text-3xl">$</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[#8B4513] text-xs font-black uppercase tracking-[0.2em] opacity-50">Score (Goal: ${currentGoal})</span>
                <span className={`font-black text-5xl tabular-nums leading-none tracking-tighter ${score >= currentGoal ? 'text-green-600' : 'text-[#8B4513]'}`}>{score}</span>
              </div>
            </div>
          </div>
          <div className="bg-white/95 backdrop-blur-md border-4 border-[#E6935E] border-dashed rounded-[3rem] px-8 py-5 max-w-[320px] shadow-2xl pointer-events-auto mt-2 transform rotate-[-1deg]">
             <p className="text-base leading-tight text-[#8B4513] font-black italic tracking-tight">"{commentary}"</p>
          </div>
          <div className="flex flex-col items-end gap-4 pointer-events-auto">
            <div className="flex items-center bg-white/95 backdrop-blur-md border-2 border-[#5EB6E6] rounded-[2.5rem] px-8 py-5 shadow-[0_10px_0_#2C5282]">
              <div className="w-14 h-14 bg-cyan-300 rounded-2xl border-2 border-[#2C5282] flex items-center justify-center mr-5 shadow-inner">
                <i className="fa-solid fa-bolt text-[#2C5282] text-3xl"></i>
              </div>
              <div className="flex flex-col">
                <span className="text-[#2C5282] text-xs font-black uppercase tracking-[0.2em] opacity-50">Shots</span>
                <span className="text-[#2C5282] font-black text-5xl tabular-nums leading-none tracking-tighter">{ballsLeft}</span>
              </div>
            </div>
            <button onClick={() => setGameState(GameState.LEVEL_SELECT)} className="w-18 h-18 bg-[#FF6B6B] border-[5px] border-[#8B0000] rounded-[2rem] flex items-center justify-center shadow-[0_8px_0_#8B0000] active:translate-y-1 active:shadow-none transition-all hover:scale-110">
               <i className="fa-solid fa-map-marked-alt text-white text-3xl"></i>
            </button>
          </div>
        </div>
      )}

      {/* SEQUENTIAL SCREENS */}
      <main className="relative flex-1 w-full h-full">
        <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} className="w-full h-full object-contain block touch-none" />

        {/* 1. MAIN MENU */}
        {gameState === GameState.MENU && (
          <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center p-8 animate-fade-in bg-black/50 backdrop-blur-[2px]">
             <div className="w-full max-w-xl bg-white/95 backdrop-blur-2xl border-[20px] border-[#FF8C42] rounded-[6rem] p-16 shadow-[0_70px_120px_-30px_rgba(0,0,0,0.8),0_30px_0_#8B4513] flex flex-col items-center gap-16 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500"></div>
                <div className="flex flex-col items-center gap-6 relative z-10">
                  <div className="px-10 py-3 bg-[#FF6B6B] rounded-full border-4 border-white shadow-2xl rotate-[-3deg]">
                    <span className="text-white font-black text-base uppercase tracking-[0.4em]">Mystery Toss</span>
                  </div>
                  <h1 className="text-[9rem] font-black text-transparent bg-clip-text bg-gradient-to-b from-[#FF8C42] to-[#D35400] text-center uppercase italic leading-[0.8] tracking-tighter drop-shadow-2xl py-2">
                    STEPH<br/><span className="text-[#FF6B6B]">TOSS</span>
                  </h1>
                </div>
                <div className="flex flex-col w-full gap-8 relative z-10">
                  <button onClick={() => setGameState(GameState.ARENA_SELECT)} className="group relative w-full bg-gradient-to-b from-[#FF6B6B] to-[#E63946] border-[10px] border-[#8B0000] rounded-[4rem] py-12 text-white font-black text-6xl uppercase shadow-[0_20px_0_#8B0000] active:translate-y-2 active:shadow-none transition-all hover:scale-[1.05]">
                    <span className="relative z-10">START QUEST</span>
                  </button>
                  <div className="w-full bg-[#FFF8F0] border-4 border-[#E6935E] rounded-[3.5rem] py-10 px-12 flex justify-between items-center shadow-inner">
                    <div className="flex flex-col">
                       <span className="font-black text-[#8B4513] text-sm uppercase tracking-[0.4em] opacity-40 mb-2">Stage Progress</span>
                       <span className="font-black text-[#FF8C42] text-6xl tabular-nums leading-none">{unlockedLevel} / 10</span>
                    </div>
                    <div className="w-24 h-24 bg-white rounded-[2.5rem] flex items-center justify-center shadow-2xl border-4 border-yellow-50">
                      <i className="fa-solid fa-gift text-[#FFB000] text-6xl"></i>
                    </div>
                  </div>
                </div>
             </div>
          </div>
        )}

        {/* 2. ARENA SELECT */}
        {gameState === GameState.ARENA_SELECT && (
          <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center p-8 animate-fade-in bg-black/50 backdrop-blur-[2px]">
            <button onClick={() => setGameState(GameState.MENU)} className="absolute top-10 left-10 w-20 h-20 bg-white border-4 border-[#FF8C42] rounded-[2rem] flex items-center justify-center shadow-[0_8px_0_#8B4513] active:translate-y-1 active:shadow-none transition-all z-[210]">
              <i className="fa-solid fa-arrow-left text-[#FF8C42] text-4xl"></i>
            </button>
            <div className="w-full max-w-[1100px] bg-white/95 backdrop-blur-2xl border-[20px] border-[#FF8C42] rounded-[7rem] p-16 shadow-[0_70px_120px_-30px_rgba(0,0,0,0.8),0_30px_0_#8B4513] flex flex-col">
               <div className="flex flex-col items-center mb-16 gap-4">
                 <h2 className="text-8xl font-black text-[#FF8C42] uppercase italic tracking-tighter leading-none">MODE SELECT</h2>
                 <p className="text-[#8B4513]/40 font-black uppercase tracking-[0.5em] text-base bg-orange-50 px-12 py-3 rounded-full border-2 border-orange-100 text-center">In Easy mode, your target is a random gift!</p>
               </div>
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                 {[
                   { id: 'Easy', balls: 15, desc: 'Random Gift Targets' },
                   { id: 'Medium', balls: 10, desc: 'Fixed Pro Challenge' },
                   { id: 'Hard', balls: 5, desc: 'Master Goal 1250+' }
                 ].map((lvl) => (
                   <div 
                    key={lvl.id} 
                    className={`group bg-white rounded-[5rem] border-4 p-14 flex flex-col items-center cursor-pointer transition-all duration-300 hover:translate-y-[-12px] relative ${difficulty === lvl.id ? `border-yellow-400 ring-[18px] ring-yellow-300/40 shadow-2xl` : 'border-[#E6935E] hover:border-[#FF8C42]'}`} 
                    onClick={() => setDifficulty(lvl.id as Difficulty)}
                   >
                     <div className={`text-xl font-black uppercase mb-12 tracking-[0.4em] ${difficulty === lvl.id ? 'text-yellow-600' : 'text-[#8B4513]/30'}`}>{lvl.id}</div>
                     <div className="relative w-40 h-40 bg-[#FFF8F0] rounded-[4rem] flex items-center justify-center mb-12 shadow-inner border-2 border-orange-50">
                        <div className={`w-20 h-32 rounded-3xl border-[5px] border-black transition-all transform group-hover:rotate-6 ${difficulty === lvl.id ? 'scale-110 shadow-3xl' : 'opacity-60'}`} style={{ backgroundColor: selectedColor }}></div>
                     </div>
                     <div className="flex flex-col items-center gap-1">
                        <span className="font-black text-[#8B4513] text-4xl tabular-nums">{lvl.balls} Balls</span>
                        <span className="text-xs font-bold uppercase tracking-widest opacity-30 text-center">{lvl.desc}</span>
                     </div>
                   </div>
                 ))}
               </div>
               <button onClick={() => setGameState(GameState.LEVEL_SELECT)} className="mt-16 w-full bg-[#FF6B6B] border-[10px] border-[#8B0000] rounded-[4.5rem] py-12 text-white font-black text-6xl uppercase shadow-[0_25px_0_#8B0000] active:translate-y-2 active:shadow-none transition-all hover:brightness-110 tracking-[0.1em]">
                 OPEN WORLD MAP
               </button>
            </div>
          </div>
        )}

        {/* 2.5 LEVEL SELECT MAP */}
        {gameState === GameState.LEVEL_SELECT && (
          <div className="absolute inset-0 z-[200] flex flex-col items-center p-8 animate-fade-in bg-black/70 backdrop-blur-sm overflow-y-auto custom-scrollbar">
            <button onClick={() => setGameState(GameState.ARENA_SELECT)} className="absolute top-10 left-10 w-20 h-20 bg-white border-4 border-[#FF8C42] rounded-[2rem] flex items-center justify-center shadow-[0_8px_0_#8B4513] active:translate-y-1 active:shadow-none transition-all z-[210]">
              <i className="fa-solid fa-arrow-left text-[#FF8C42] text-4xl"></i>
            </button>
            <div className="w-full max-w-[900px] flex flex-col items-center py-24 relative min-h-screen text-center">
               <h2 className="text-9xl font-black text-white uppercase italic tracking-tighter drop-shadow-lg mb-4">MAP</h2>
               <p className="text-yellow-400 font-black uppercase tracking-[0.5em] text-sm mb-20">{difficulty} MODE ADVENTURE</p>
               
               <div className="relative w-full flex flex-col items-center gap-24">
                 <div className="absolute top-0 bottom-0 w-3 bg-gradient-to-b from-red-500 via-orange-500 to-yellow-500 rounded-full"></div>
                 {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                   const offset = Math.sin(num * 1.3) * 180;
                   const isCompleted = num < unlockedLevel;
                   const isLocked = num > unlockedLevel;
                   return (
                     <div 
                        key={num} 
                        style={{ transform: `translateX(${offset}px)` }}
                        className={`group relative z-10 w-40 h-40 rounded-[3.5rem] flex items-center justify-center transition-all duration-500 
                          ${isLocked ? 'grayscale opacity-50 cursor-not-allowed scale-90' : 'cursor-pointer hover:scale-110'}
                          ${num === unlockedLevel ? 'bg-yellow-400 border-[10px] border-white ring-[20px] ring-yellow-400/30 shadow-[0_0_80px_rgba(250,204,21,1)]' : 
                            isCompleted ? 'bg-[#FF6B6B] border-[8px] border-white/50 opacity-90' : 'bg-white/30 border-[8px] border-white/10'}`}
                        onClick={() => {
                          if (!isLocked) {
                            setCurrentLevel(num);
                            if (difficulty === 'Easy') {
                              setMysteryTarget(null); // Clear previous
                              setGameState(GameState.INSTRUCTIONS);
                            } else {
                              setGameState(GameState.INSTRUCTIONS);
                            }
                          } else {
                            showToast("LOCKED", WIDTH/2, HEIGHT/2);
                          }
                        }}
                     >
                       <span className="text-7xl font-black text-white leading-none">
                         {isLocked ? <i className="fa-solid fa-lock text-5xl"></i> : num}
                       </span>
                       {isCompleted && (
                         <div className="absolute -top-5 -right-5 w-14 h-14 bg-green-500 rounded-2xl flex items-center justify-center border-4 border-white shadow-xl">
                           <i className="fa-solid fa-check text-white text-3xl"></i>
                         </div>
                       )}
                     </div>
                   );
                 })}
               </div>
               <div className="h-60"></div>
            </div>
          </div>
        )}

        {/* 3. INSTRUCTIONS / GIFT REVEAL */}
        {gameState === GameState.INSTRUCTIONS && (
          <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center p-8 animate-fade-in bg-black/50 backdrop-blur-[2px]">
            <button onClick={() => setGameState(GameState.LEVEL_SELECT)} className="absolute top-10 left-10 w-20 h-20 bg-white border-4 border-[#FF8C42] rounded-[2rem] flex items-center justify-center shadow-[0_8px_0_#8B4513] active:translate-y-1 active:shadow-none transition-all z-[210]">
              <i className="fa-solid fa-arrow-left text-[#FF8C42] text-4xl"></i>
            </button>

            <div className="w-full max-w-2xl bg-white/95 backdrop-blur-2xl border-[20px] border-[#FF8C42] rounded-[6rem] p-16 shadow-[0_70px_120px_-30px_rgba(0,0,0,0.8)] text-center">
               <h2 className="text-8xl font-black text-[#FF8C42] mb-12 uppercase italic leading-none">STAGE {currentLevel}</h2>
               
               {difficulty === 'Easy' && mysteryTarget === null ? (
                 <div className="flex flex-col items-center gap-10">
                   <div className={`w-64 h-64 bg-yellow-400 rounded-[4rem] border-8 border-[#FF8C42] flex items-center justify-center shadow-2xl relative ${isRevealingGift ? 'animate-bounce' : 'animate-float-mid'}`}>
                      <i className="fa-solid fa-gift text-white text-9xl"></i>
                      {isRevealingGift && <div className="absolute inset-0 bg-white/40 animate-pulse rounded-[4rem]"></div>}
                   </div>
                   <p className="text-[#8B4513] font-black text-2xl uppercase tracking-[0.2em]">Mystery Target Recieved?</p>
                   <button onClick={revealGift} disabled={isRevealingGift} className="w-full bg-[#FF6B6B] border-[8px] border-[#8B0000] rounded-[3.5rem] py-10 text-white font-black text-5xl uppercase shadow-[0_15px_0_#8B0000] active:translate-y-2 active:shadow-none transition-all">
                     {isRevealingGift ? 'UNWRAPPING...' : 'OPEN GIFT'}
                   </button>
                 </div>
               ) : (
                 <>
                   <div className="bg-orange-50 border-4 border-orange-100 rounded-[3rem] p-10 mb-12 flex flex-col items-center gap-4">
                      <span className="text-[#8B4513]/40 font-black uppercase tracking-[0.4em] text-sm">Target Earnings</span>
                      <span className="text-8xl font-black text-[#FF6B6B] tabular-nums animate-realistic-pop-static">${currentGoal}</span>
                      {difficulty === 'Easy' && <span className="text-xs text-yellow-600 font-bold uppercase tracking-widest">(GIFT TARGET RECEIVED!)</span>}
                   </div>
                   <button onClick={startCountdown} className="w-full bg-[#FF6B6B] border-[10px] border-[#8B0000] rounded-[4.5rem] py-12 text-white font-black text-6xl uppercase shadow-[0_25px_0_#8B0000] active:translate-y-2 active:shadow-none transition-all hover:scale-103">
                     LET'S TOSS
                   </button>
                 </>
               )}
            </div>
          </div>
        )}

        {/* 4. COUNTDOWN */}
        {gameState === GameState.COUNTDOWN && (
          <div className="absolute inset-0 z-[300] flex flex-col items-center justify-center pointer-events-none bg-black/30 backdrop-blur-[10px]">
             <div className="text-[25rem] font-black text-white italic drop-shadow-[0_40px_0_#8B4513] animate-ping-once tracking-tighter">
                {countdown}
             </div>
          </div>
        )}

        {/* 6. RESULTS SCREEN */}
        {gameState === GameState.GAMEOVER && (
          <div className="absolute inset-0 z-[300] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-8 text-center animate-fade-in overflow-hidden">
             {targetMet && confettiItems.map((c, i) => (
               <ConfettiParticle key={i} delay={c.delay} left={c.left} color={c.color} />
             ))}
             <div className="w-full max-w-3xl bg-white border-[20px] border-[#FF8C42] rounded-[8rem] p-20 shadow-[0_100px_200px_-40px_rgba(0,0,0,1)] relative animate-scale-bounce">
                <div className="absolute -top-28 left-1/2 -translate-x-1/2 w-56 h-56 bg-white border-[16px] border-[#FF8C42] rounded-full flex items-center justify-center shadow-3xl z-10">
                   <i className={`fa-solid ${targetMet ? 'fa-trophy text-[#FFB000]' : 'fa-circle-xmark text-red-500'} text-[10rem]`}></i>
                </div>
                <div className="flex flex-col items-center mt-20 mb-10 gap-4 relative z-10">
                  <h2 className="text-9xl font-black text-[#FF8C42] uppercase italic leading-none">
                    {targetMet ? 'WINNER!' : 'MISS!'}
                  </h2>
                  <p className="font-black uppercase tracking-[0.5em] text-sm opacity-50">
                    {targetMet ? 'GOAL SMASHED' : `NEEDED $${currentGoal}`}
                  </p>
                </div>
                <div className="bg-gradient-to-b from-[#FFF7EE] to-white px-12 py-16 rounded-[6rem] border-4 border-[#E6935E] mb-16 shadow-inner flex flex-col items-center">
                    <span className="text-[#8B4513] text-lg font-black uppercase tracking-[0.6em] opacity-40">Profit Collected</span>
                    <span className={`text-[13rem] font-black leading-none animate-grow ${targetMet ? 'text-green-500' : 'text-red-500'}`}>${score}</span>
                    <div className="w-full h-8 bg-gray-100 rounded-full mt-8 overflow-hidden border-2 border-gray-200">
                      <div className={`h-full transition-all duration-1000 ${targetMet ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, (score/currentGoal)*100)}%` }}></div>
                    </div>
                </div>
                <div className="flex flex-col md:flex-row gap-8 relative z-10 w-full">
                  <button onClick={() => setGameState(GameState.LEVEL_SELECT)} className="group flex-1 bg-white border-4 border-[#E6935E] rounded-[4rem] py-8 text-[#8B4513] font-black text-2xl uppercase shadow-[0_12px_0_#DDD] active:translate-y-2 active:shadow-none transition-all">
                    WORLD MAP
                  </button>
                  <button 
                    onClick={() => {
                      if (targetMet) {
                        if (currentLevel < 10) { setCurrentLevel(currentLevel + 1); setGameState(GameState.LEVEL_SELECT); } 
                        else { setGameState(GameState.MENU); }
                      } else { startCountdown(); }
                    }} 
                    className={`group flex-[1.7] border-[10px] rounded-[4rem] py-8 text-white font-black text-4xl uppercase active:translate-y-2 active:shadow-none transition-all
                      ${targetMet ? 'bg-gradient-to-b from-[#22c55e] to-[#16a34a] border-[#14532d] shadow-[0_20px_0_#14532d]' : 'bg-gradient-to-b from-[#FF6B6B] to-[#E63946] border-[#8B0000] shadow-[0_20px_0_#8B0000]'}`}
                  >
                    {targetMet ? (currentLevel < 10 ? 'NEXT LEVEL' : 'FINISHED') : 'RETRY STAGE'}
                  </button>
                </div>
             </div>
          </div>
        )}

        {/* TOASTS */}
        {toast && (
          <div style={{ left: (toast.x / WIDTH) * 100 + '%', top: (toast.y / HEIGHT) * 100 + '%' }} className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 animate-realistic-pop z-[200]">
            <span className="text-[14rem] font-black text-yellow-400 italic drop-shadow-[0_20px_0_black] leading-none">${toast.message.replace('+$','')}</span>
          </div>
        )}
      </main>

      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(800px) rotate(720deg); opacity: 0; }
        }
        @keyframes scale-bounce {
          0% { transform: scale(0.7); opacity: 0; }
          65% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes grow {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes realistic-pop {
          0% { transform: translate(-50%, 0) scale(0.3); opacity: 0; }
          25% { transform: translate(-50%, -70px) scale(1.7); opacity: 1; }
          100% { transform: translate(-50%, -500px) scale(2.6); opacity: 0; }
        }
        @keyframes realistic-pop-static {
          0% { transform: scale(0.4); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float-mid {
          0%, 100% { transform: translateY(0) rotate(0); }
          50% { transform: translateY(-30px) rotate(5deg); }
        }
        @keyframes ping-once {
          0% { transform: scale(0.1); opacity: 0; }
          45% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-confetti-fall { animation: confetti-fall 4.5s linear infinite; }
        .animate-scale-bounce { animation: scale-bounce 0.7s cubic-bezier(0.19, 1, 0.22, 1) forwards; }
        .animate-grow { animation: grow 2s infinite ease-in-out; }
        .animate-float-mid { animation: float-mid 4s infinite ease-in-out; }
        .animate-fade-in { animation: fade-in 0.7s cubic-bezier(0.19, 1, 0.22, 1) forwards; }
        .animate-realistic-pop { animation: realistic-pop 1.8s cubic-bezier(0.19, 1, 0.22, 1) forwards; }
        .animate-realistic-pop-static { animation: realistic-pop-static 0.5s cubic-bezier(0.19, 1, 0.22, 1) forwards; }
        .animate-ping-once { animation: ping-once 0.8s cubic-bezier(0.19, 1, 0.22, 1) forwards; }
        .custom-scrollbar::-webkit-scrollbar { width: 12px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #FF8C42; border-radius: 20px; }
        .shadow-text-red { text-shadow: 0 15px 0 rgba(139, 0, 0, 0.4); }
      `}</style>
    </div>
  );
};

export default App;
