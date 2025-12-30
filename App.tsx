
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import { GameState, Difficulty, Cup, Ball, Vector2D, RewardType } from './types';
import { getCommentary } from './services/commentaryService';

interface DynamicCup extends Cup {
  baseX: number;
  baseY: number;
  color: string;
  phase: number;
  speed: number;
  amp: number;
  zScale: number; 
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

const CUP_COLORS = [
  '#f43f5e', // Rose
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#84cc16', // Lime
  '#f97316', // Orange
  '#a855f7', // Purple
];

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
  const [lives, setLives] = useState(3);
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium');
  const [currentLevel, setCurrentLevel] = useState(1);
  const [unlockedLevel, setUnlockedLevel] = useState<number>(() => {
    const saved = localStorage.getItem('steph_toss_unlocked_level');
    return saved ? parseInt(saved, 10) : 1;
  });
  const [commentary, setCommentary] = useState("Step right up! Test your skill!");
  const [toast, setToast] = useState<{ message: string, x: number, y: number, colorClass?: string } | null>(null);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [menuHeroImage, setMenuHeroImage] = useState<string | null>(null);
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);
  const [countdown, setCountdown] = useState<number | string>(3);
  const [currentPowerPercent, setCurrentPowerPercent] = useState(0);
  
  // --- GAME STATS ---
  const [stats, setStats] = useState({ hits: 0, jackpots: 0, totalTossed: 0 });

  // --- PHYSICS & RENDERING REFS ---
  const scoreRef = useRef(0);
  const ballsLeftRef = useRef(10);
  const livesRef = useRef(3);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cupsRef = useRef<DynamicCup[]>([]);
  const ballRef = useRef<Ball | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const shakeRef = useRef(0);
  const dragStartRef = useRef<Vector2D | null>(null);
  const dragCurrentRef = useRef<Vector2D | null>(null);
  const requestRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  // --- CONSTANTS ---
  const WIDTH = 800;
  const HEIGHT = 600;
  const TABLE_TOP_Y = 260; 
  const TABLE_FRONT_Y = 520; 
  const TABLE_TOP_WIDTH = 400; 
  const TABLE_BOTTOM_WIDTH = 900; 
  const BASE_CUP_WIDTH = 45; 
  const BASE_CUP_HEIGHT = 65; 
  const SLING_START = { x: 400, y: 565 }; 
  const GRAVITY = 0.45; 
  const FRICTION_AIR = 0.998; 
  const FRICTION_GROUND = 0.92; 
  const BOUNCE = 0.55;    
  const STOP_THRESHOLD = 0.25;
  const MAX_POWER = 50; 
  const POWER_SENSITIVITY = 0.22; 

  const THEMES = [
    "Neon Cyberpunk Tokyo Alleyway at Night",
    "Ancient Egyptian Temple with Sand Dunes",
    "Outer Space Nebula with Distant Galaxies",
    "Enchanted Forest with Glowing Mushrooms",
    "Underwater Atlantis Ruins with Coral",
    "Cozy Log Cabin Fireplace Interior",
    "Pirate Island Beach with Shipwreck",
    "Majestic Snow-Capped Alpine Mountains",
    "Industrial Steampunk Factory with Gears",
    "Volcanic Hellscape with Lava Flows"
  ];

  const VX_MULT = 1.6;
  const VY_MULT = 1.8;

  const getTargetScore = useCallback((level: number, diff: Difficulty) => {
    const factor = diff === 'Easy' ? 400 : diff === 'Medium' ? 750 : 1250;
    return level * factor;
  }, []);

  const currentGoal = getTargetScore(currentLevel, difficulty);
  const targetMet = score >= currentGoal;

  useEffect(() => {
    localStorage.setItem('steph_toss_unlocked_level', unlockedLevel.toString());
  }, [unlockedLevel]);

  const generateMenuAssets = useCallback(async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `A highly stylized, professional mobile game hero illustration. Centered, 3D vibrant red solo cup, a shiny white ping pong ball floating above it, and an open glowing mystery gift box next to it with magical sparkles and small floating question marks. Neon purple and pink background accents. No text. 1:1 aspect ratio. High quality digital art style, smooth 3D renders.`;
      
      const imgResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio: "1:1" } }
      });

      const parts = imgResponse.candidates?.[0]?.content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData) {
            setMenuHeroImage(`data:image/png;base64,${part.inlineData.data}`);
            break;
          }
        }
      }
    } catch (error: any) {
      console.error("Menu Art Generation Error:", error);
    }
  }, []);

  const generateBackground = useCallback(async (level: number) => {
    setIsGeneratingBg(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const theme = THEMES[(level - 1) % THEMES.length];
      const prompt = `A beautiful, vibrant, professional 2D game background for a mobile game. Theme: ${theme}. Clean perspective, high-quality digital art, vibrant colors, no text, no characters. Cinematic lighting.`;
      
      const imgResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio: "16:9" } }
      });

      const parts = imgResponse.candidates?.[0]?.content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData) {
            setBgImage(`data:image/png;base64,${part.inlineData.data}`);
            break;
          }
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
    generateMenuAssets();
  }, [currentLevel, generateBackground, generateMenuAssets]);

  const initCups = useCallback((level: Difficulty, stage: number) => {
    const count = level === 'Easy' ? 10 : level === 'Medium' ? 7 : 5;
    const tempCups: DynamicCup[] = [];
    const specialPool: RewardType[] = ['jackpot', 'life', 'balls', 'diamond', 'bomb'];
    const rewardIndices = new Set<number>();
    while(rewardIndices.size < Math.min(count, specialPool.length)) {
      rewardIndices.add(Math.floor(Math.random() * count));
    }
    const idxArray = Array.from(rewardIndices);

    for (let i = 0; i < count; i++) {
      let depth = 0.2;
      let xOffset = 0;
      switch(stage % 5) {
        case 1: depth = (i / count) * 0.4 + 0.1; xOffset = (i - (count-1)/2) * 70; break;
        case 2: const half = (count - 1) / 2; depth = 0.1 + (Math.abs(i - half) * 0.15); xOffset = (i - half) * 80; break;
        case 3: if (i === 0) { depth = 0.1; xOffset = 0; } else if (i < 3) { depth = 0.25; xOffset = (i === 1 ? -50 : 50); } else { depth = 0.45; xOffset = (i - 4) * 70; } break;
        case 4: depth = 0.1 + Math.random() * 0.4; xOffset = (Math.random() - 0.5) * 350; break;
        case 0: depth = (i % 2 === 0 ? 0.15 : 0.4); xOffset = (i - (count-1)/2) * 95; break;
        default: depth = 0.1 + (i * 0.08); xOffset = 0;
      }
      const zScale = 0.55 + (depth * 0.45); 
      const yPos = TABLE_TOP_Y + (TABLE_FRONT_Y - TABLE_TOP_Y) * depth;
      const xPos = WIDTH / 2 + xOffset * zScale - (BASE_CUP_WIDTH * zScale / 2);
      let rewardType: RewardType = 'money';
      let value = 10 + (stage * 5);
      const specialIdx = idxArray.indexOf(i);
      if (specialIdx !== -1) {
        rewardType = specialPool[specialIdx];
        if (rewardType === 'jackpot') value = 500 + (stage * 50);
        if (rewardType === 'diamond') value = 1000 + (stage * 100);
      }
      
      const color = CUP_COLORS[i % CUP_COLORS.length];

      tempCups.push({
        id: i, baseX: xPos, baseY: yPos, x: xPos, y: yPos, width: BASE_CUP_WIDTH * zScale, height: BASE_CUP_HEIGHT * zScale,
        label: "", value, rewardType, isRevealed: false, color, phase: Math.random() * Math.PI * 2,
        speed: (level === 'Easy' ? 0.6 : 1.5) * (0.8 + Math.random() * 0.4) * (1 + (stage * 0.04)),
        amp: (level === 'Easy' ? 10 : 35) * (0.8 + Math.random() * 0.4) * (1 + (stage * 0.04)), zScale: zScale
      });
    }
    tempCups.sort((a, b) => a.y - b.y);
    cupsRef.current = tempCups;
  }, []);

  useEffect(() => {
    initCups(difficulty, currentLevel);
  }, [difficulty, currentLevel, initCups]);

  const triggerCommentary = async (type: 'hit' | 'miss' | 'gameover' | 'bomb') => {
    const text = await getCommentary(type === 'bomb' ? 'miss' : type, scoreRef.current, ballsLeftRef.current);
    setCommentary(text);
  };

  const showToast = (message: string, x: number, y: number, colorClass?: string) => {
    setToast({ message, x, y, colorClass });
    setTimeout(() => setToast(null), 1500);
  };

  const createExplosion = (x: number, y: number, color: string) => {
    const count = 40;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 12 + 4;
      particlesRef.current.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 1.0, color: i % 2 === 0 ? color : '#FFFFFF', size: Math.random() * 6 + 2
      });
    }
    shakeRef.current = 20;
  };

  const remixRewards = useCallback(() => {
    const unrevealed = cupsRef.current.filter(c => !c.isRevealed);
    if (unrevealed.length <= 1) return;
    const pool = unrevealed.map(c => ({ type: c.rewardType, val: c.value }));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    unrevealed.forEach((c, idx) => {
      c.rewardType = pool[idx].type;
      c.value = pool[idx].val;
    });
    showToast("REWARDS MIXED!", WIDTH / 2, 120, "text-purple-500 font-bold drop-shadow-lg text-4xl uppercase");
  }, []);

  const startCountdown = () => {
    setStats({ hits: 0, jackpots: 0, totalTossed: 0 });
    setScore(0); scoreRef.current = 0;
    setLives(3); livesRef.current = 3;
    setGameState(GameState.COUNTDOWN);
    let count = 3; setCountdown(count);
    const interval = setInterval(() => {
      count -= 1;
      if (count === 0) setCountdown("GO!");
      else if (count < 0) { clearInterval(interval); startGame(); }
      else setCountdown(count);
    }, 1000);
  };

  const startGame = () => {
    const startBalls = difficulty === 'Easy' ? 15 : difficulty === 'Medium' ? 10 : 5;
    ballsLeftRef.current = startBalls; setBallsLeft(startBalls);
    setGameState(GameState.AIMING);
    setCommentary(`Goal: $${currentGoal}!`);
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
    const pos = { x: (e.clientX - rect.left) * (WIDTH / rect.width), y: (e.clientY - rect.top) * (HEIGHT / rect.height) };
    dragCurrentRef.current = pos;
    const dx = dragStartRef.current.x - pos.x;
    const dy = dragStartRef.current.y - pos.y;
    const power = Math.sqrt(dx*dx + dy*dy);
    setCurrentPowerPercent(Math.min(100, (power / 180) * 100));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragStartRef.current || !dragCurrentRef.current) return;
    const dx = dragStartRef.current.x - dragCurrentRef.current.x;
    const dy = dragStartRef.current.y - dragCurrentRef.current.y;
    const vx = Math.min(Math.max(dx * POWER_SENSITIVITY, -MAX_POWER), MAX_POWER) * VX_MULT;
    const vy = Math.min(Math.max(dy * POWER_SENSITIVITY, -MAX_POWER), MAX_POWER) * VY_MULT; 
    if (Math.abs(vx) > 0.5 || Math.abs(vy) > 0.5) {
      ballRef.current = { x: SLING_START.x, y: SLING_START.y, vx, vy, radius: 10, inCup: false, active: true };
      ballsLeftRef.current -= 1; setBallsLeft(ballsLeftRef.current);
      setStats(prev => ({ ...prev, totalTossed: prev.totalTossed + 1 }));
      setGameState(GameState.THROWN);
    }
    dragStartRef.current = null; dragCurrentRef.current = null;
    setCurrentPowerPercent(0);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const checkLifeSupport = useCallback(() => {
    if (ballsLeftRef.current === 0 && livesRef.current > 0) {
      livesRef.current -= 1; setLives(livesRef.current);
      ballsLeftRef.current += 3; setBallsLeft(ballsLeftRef.current);
      showToast("RELOAD! +3 BALLS", WIDTH/2, HEIGHT/2, "text-red-500 font-black");
      return true;
    }
    return false;
  }, []);

  const handleScore = useCallback((cup: DynamicCup) => {
    if (!ballRef.current) return;
    ballRef.current.active = false; ballRef.current.inCup = true;
    cup.isRevealed = true;
    let rewardMsg = "";
    let colorClass = "text-yellow-400";
    let boomColor = "#facc15"; 

    if (cup.rewardType === 'life') {
      livesRef.current += 1; setLives(livesRef.current);
      rewardMsg = "+1 LIFE"; colorClass = "text-red-500"; boomColor = "#ef4444";
    } else if (cup.rewardType === 'balls') {
      ballsLeftRef.current += 5; setBallsLeft(ballsLeftRef.current);
      rewardMsg = "+5 BALLS"; colorClass = "text-blue-400"; boomColor = "#3b82f6";
    } else if (cup.rewardType === 'diamond') {
      scoreRef.current += cup.value; setScore(scoreRef.current);
      rewardMsg = "DIAMOND! +$" + cup.value; colorClass = "text-cyan-300"; boomColor = "#22d3ee";
    } else if (cup.rewardType === 'jackpot') {
      scoreRef.current += cup.value; setScore(scoreRef.current);
      rewardMsg = "JACKPOT! +$" + cup.value; boomColor = "#eab308";
      setStats(prev => ({ ...prev, jackpots: prev.jackpots + 1 }));
    } else if (cup.rewardType === 'bomb') {
      livesRef.current -= 1; setLives(livesRef.current);
      rewardMsg = "BOOM! -1 LIFE"; colorClass = "text-red-600 font-bold"; boomColor = "#7f1d1d";
      triggerCommentary('bomb');
    } else {
      scoreRef.current += cup.value; setScore(scoreRef.current);
      rewardMsg = `+$${cup.value}`;
    }

    if (cup.rewardType !== 'bomb') {
      setStats(prev => ({ ...prev, hits: prev.hits + 1 }));
      triggerCommentary('hit');
    }
    
    createExplosion(cup.x + cup.width/2, cup.y, boomColor);
    showToast(rewardMsg, cup.x + cup.width/2, cup.y - 40, colorClass);
    remixRewards();

    setTimeout(() => {
      const hasResource = (ballsLeftRef.current > 0 || checkLifeSupport()) && livesRef.current >= 0;
      if (hasResource) setGameState(GameState.AIMING);
      else finishGame();
    }, 1200);
  }, [difficulty, currentLevel, unlockedLevel, getTargetScore, checkLifeSupport, remixRewards]);

  const finishGame = () => {
    if (scoreRef.current >= currentGoal && currentLevel === unlockedLevel && unlockedLevel < 10) {
      setUnlockedLevel(prev => prev + 1);
    }
    setGameState(GameState.GAMEOVER);
    triggerCommentary('gameover');
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const elapsed = Date.now() - startTimeRef.current;
    
    ctx.clearRect(0,0, WIDTH, HEIGHT);
    if (gameState !== GameState.AIMING && gameState !== GameState.THROWN) {
       ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0,0, WIDTH, HEIGHT); return;
    }

    ctx.save();
    if (shakeRef.current > 0) {
      ctx.translate((Math.random() - 0.5) * shakeRef.current, (Math.random() - 0.5) * shakeRef.current);
      shakeRef.current *= 0.9;
      if (shakeRef.current < 0.5) shakeRef.current = 0;
    }

    ctx.fillStyle = 'transparent'; ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.save();
    const woodGrad = ctx.createLinearGradient(0, TABLE_TOP_Y, 0, TABLE_FRONT_Y);
    woodGrad.addColorStop(0, 'rgba(26, 13, 10, 0.95)'); woodGrad.addColorStop(1, 'rgba(45, 24, 20, 0.98)');
    ctx.fillStyle = woodGrad; ctx.beginPath();
    ctx.moveTo(WIDTH/2 - TABLE_TOP_WIDTH/2, TABLE_TOP_Y); ctx.lineTo(WIDTH/2 + TABLE_TOP_WIDTH/2, TABLE_TOP_Y);
    ctx.lineTo(WIDTH/2 + TABLE_BOTTOM_WIDTH/2, TABLE_FRONT_Y); ctx.lineTo(WIDTH/2 - TABLE_BOTTOM_WIDTH/2, TABLE_FRONT_Y);
    ctx.closePath(); ctx.fill(); ctx.restore();

    ctx.fillStyle = '#100605'; ctx.fillRect(WIDTH/2 - TABLE_BOTTOM_WIDTH/2, TABLE_FRONT_Y, TABLE_BOTTOM_WIDTH, 20);

    cupsRef.current.forEach(cup => {
      cup.x = cup.baseX + Math.sin((elapsed / 1000) * cup.speed + cup.phase) * cup.amp;
      const cx = cup.x, cy = cup.y, cw = cup.width, ch = cup.height;
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.filter = `blur(${3 + 5 * cup.zScale}px)`;
      ctx.beginPath(); ctx.ellipse(cx + cw/2 + 2, cy + ch - 2, (cw/2 + 6), 8 * cup.zScale, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
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
    });

    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.2; 
      p.life -= 0.025;
      if (p.life <= 0) { particlesRef.current.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }

    if (dragStartRef.current && dragCurrentRef.current) {
      const dx = dragStartRef.current.x - dragCurrentRef.current.x;
      const dy = dragStartRef.current.y - dragCurrentRef.current.y;
      ctx.save(); ctx.setLineDash([4, 12]); ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; ctx.beginPath();
      let sX = SLING_START.x, sY = SLING_START.y;
      let sVX = Math.min(Math.max(dx * POWER_SENSITIVITY, -MAX_POWER), MAX_POWER) * VX_MULT;
      let sVY = Math.min(Math.max(dy * POWER_SENSITIVITY, -MAX_POWER), MAX_POWER) * VY_MULT;
      ctx.moveTo(sX, sY);
      for(let i=0; i<60; i++) { sX += sVX; sVY += GRAVITY; sVX *= FRICTION_AIR; sY += sVY; ctx.lineTo(sX, sY); if(sY > HEIGHT) break; }
      ctx.stroke(); ctx.restore();
    }

    if (ballRef.current && ballRef.current.active) {
      const b = ballRef.current; b.vy += GRAVITY; b.vx *= FRICTION_AIR; b.x += b.vx; b.y += b.vy;
      if (b.vy > 0) {
        const hitZone = difficulty === 'Easy' ? 28 : 20;
        for (const cup of cupsRef.current) {
          if (Math.abs(b.y - cup.y) < 15 && b.x >= cup.x - hitZone && b.x <= cup.x + cup.width + hitZone) { handleScore(cup); break; }
        }
      }
      const isOverTable = b.x > (WIDTH/2 - TABLE_BOTTOM_WIDTH/2) && b.x < (WIDTH/2 + TABLE_BOTTOM_WIDTH/2);
      const surfaceY = (isOverTable && b.y < TABLE_FRONT_Y + 10) ? TABLE_FRONT_Y - 5 : HEIGHT;
      if (b.y > surfaceY - b.radius) { b.y = surfaceY - b.radius; b.vy *= -BOUNCE; b.vx *= FRICTION_GROUND; b.vy *= FRICTION_GROUND; }
      if (b.x < b.radius || b.x > WIDTH - b.radius) { b.vx *= -BOUNCE; b.x = b.x < b.radius ? b.radius : WIDTH - b.radius; }
      if (Math.sqrt(b.vx**2 + b.vy**2) < STOP_THRESHOLD && b.y > TABLE_TOP_Y) {
        b.active = false; triggerCommentary('miss');
        setTimeout(() => {
          const hasResource = ballsLeftRef.current > 0 || checkLifeSupport();
          if (hasResource) setGameState(GameState.AIMING);
          else finishGame();
        }, 800);
      }
      ctx.save();
      const ballGrad = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, 11);
      ballGrad.addColorStop(0, '#ffffff'); ballGrad.addColorStop(1, '#fbbf24');
      ctx.fillStyle = ballGrad; ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    } else if (gameState === GameState.AIMING) {
      ctx.save(); ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(SLING_START.x, SLING_START.y, 10, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }, [gameState, difficulty, handleScore, currentGoal, checkLifeSupport]);

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
      style={{ backgroundImage: bgImage ? `url(${bgImage})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#000' }}>
      
      {isGeneratingBg && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-black/80 backdrop-blur-md">
           <div className="flex flex-col items-center gap-6">
              <div className="w-24 h-24 border-8 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-white font-black text-2xl uppercase tracking-widest animate-pulse">Entering New Realm...</span>
           </div>
        </div>
      )}

      {(gameState === GameState.AIMING || gameState === GameState.THROWN) && (
        <>
          <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-[100] pointer-events-none">
            <div className="flex flex-col gap-3 pointer-events-auto">
              <div className="flex items-center bg-white/95 backdrop-blur-md border-2 border-[#E6935E] rounded-[2rem] px-6 py-4 shadow-[0_8px_0_#8B4513]">
                <div className="w-10 h-10 bg-yellow-400 rounded-xl border-2 border-[#8B4513] flex items-center justify-center mr-4 shadow-inner">
                  <span className="text-[#8B4513] font-black text-xl">$</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[#8B4513] text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Score (Goal: ${currentGoal})</span>
                  <span className={`font-black text-4xl tabular-nums leading-none tracking-tighter ${score >= currentGoal ? 'text-green-600' : 'text-[#8B4513]'}`}>{score}</span>
                </div>
              </div>
              <div className="flex items-center bg-white/95 backdrop-blur-md border-2 border-red-400 rounded-[2rem] px-6 py-4 shadow-[0_8px_0_#991b1b]">
                <div className="w-10 h-10 bg-red-500 rounded-xl border-2 border-white flex items-center justify-center mr-4 shadow-inner">
                  <i className="fa-solid fa-heart text-white text-xl"></i>
                </div>
                <div className="flex flex-col">
                  <span className="text-red-700 text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Life</span>
                  <span className="text-red-600 font-black text-4xl tabular-nums leading-none tracking-tighter">{lives}</span>
                </div>
              </div>
              <div className="flex items-center bg-white/95 backdrop-blur-md border-2 border-[#5EB6E6] rounded-[2rem] px-6 py-4 shadow-[0_8px_0_#2C5282]">
                <div className="w-10 h-10 bg-cyan-400 rounded-xl border-2 border-[#2C5282] flex items-center justify-center mr-4 shadow-inner">
                  <i className="fa-solid fa-bolt text-[#2C5282] text-2xl"></i>
                </div>
                <div className="flex flex-col">
                  <span className="text-[#2C5282] text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Balls</span>
                  <span className="text-[#2C5282] font-black text-4xl tabular-nums leading-none tracking-tighter">{ballsLeft}</span>
                </div>
              </div>
            </div>

            <div className="absolute top-10 left-1/2 -translate-x-1/2 z-[110] bg-white/95 backdrop-blur-md border-4 border-[#E6935E] border-dashed rounded-[3rem] px-12 py-8 w-full max-w-[520px] shadow-2xl pointer-events-auto transform rotate-[-0.5deg] transition-all duration-300">
               <p className="text-2xl leading-snug text-[#8B4513] font-black italic tracking-tight text-center">"{commentary}"</p>
            </div>

            <div className="flex flex-col items-end gap-3 pointer-events-auto">
              <button onClick={() => setGameState(GameState.LEVEL_SELECT)} className="w-16 h-16 bg-[#FF6B6B] border-[4px] border-[#8B0000] rounded-[1.5rem] flex items-center justify-center shadow-[0_6px_0_#8B0000] active:translate-y-1 active:shadow-none transition-all hover:scale-110">
                 <i className="fa-solid fa-map-marked-alt text-white text-2xl"></i>
              </button>
            </div>
          </div>

          <div className="absolute right-8 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4 z-[100] pointer-events-none">
            <span className="text-white font-black text-xs uppercase tracking-[0.3em] bg-black/40 px-3 py-1 rounded-full border border-white/20">Power</span>
            <div className="w-14 h-80 bg-black/40 backdrop-blur-md border-4 border-white/30 rounded-[2rem] relative overflow-hidden shadow-2xl">
               <div className="absolute bottom-0 left-0 w-full transition-all duration-75 ease-out shadow-[0_0_30px_rgba(255,255,255,0.5)]"
                 style={{ height: `${currentPowerPercent}%`, background: `linear-gradient(to top, #22c55e 0%, #eab308 50%, #ef4444 100%)`, boxShadow: `0 0 40px ${currentPowerPercent > 80 ? '#ef4444' : currentPowerPercent > 40 ? '#eab308' : '#22c55e'}` }} />
               <div className="absolute inset-0 flex flex-col justify-between items-center py-6 opacity-40">
                  <span className="text-white font-black text-[10px]">MAX</span><div className="w-full border-t-2 border-white/20"></div><div className="w-full border-t-2 border-white/20"></div><div className="w-full border-t-2 border-white/20"></div><span className="text-white font-black text-[10px]">MIN</span>
               </div>
            </div>
            {currentPowerPercent > 0 && <div className="animate-pulse bg-white/90 border-2 border-red-500 rounded-xl px-3 py-1 shadow-lg"><span className="text-red-600 font-black text-lg italic tracking-tighter">{Math.round(currentPowerPercent)}%</span></div>}
          </div>
        </>
      )}

      <main className="relative flex-1 w-full h-full">
        <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} className="w-full h-full object-contain block touch-none" />

        {gameState === GameState.MENU && (
          <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center p-4 animate-fade-in bg-black/70 backdrop-blur-[4px]">
             {/* Slightly smaller and zoomed out card for better visibility */}
             <div className="w-[380px] max-w-[90vw] h-[680px] max-h-[85vh] bg-white border-[12px] border-[#FF8C42] rounded-[4.5rem] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] flex flex-col items-center justify-between p-8 relative overflow-hidden transform scale-95 lg:scale-100">
                
                {/* Floating mystery toss badge */}
                <div className="mt-2 px-6 py-2 bg-[#FF6B6B] rounded-full border-2 border-white shadow-md transform rotate-[-2deg] z-20">
                  <span className="text-white font-black text-[10px] uppercase tracking-[0.4em]">Mystery Toss</span>
                </div>

                {/* STEPH TOSS Logo Area */}
                <div className="flex flex-col items-center z-20">
                  <h1 className="text-8xl font-black text-center uppercase italic leading-[0.8] tracking-tighter py-3">
                    <span className="text-transparent bg-clip-text bg-gradient-to-b from-[#FF8C42] to-[#D35400] drop-shadow-md">STEPH</span>
                    <br/>
                    <span className="text-[#FF6B6B] drop-shadow-md">TOSS</span>
                  </h1>
                </div>

                {/* Illustrative Hero Area */}
                <div className="relative w-full flex-1 flex items-center justify-center py-4 z-10">
                  {menuHeroImage ? (
                    <img src={menuHeroImage} alt="Hero" className="w-full h-full object-contain animate-float drop-shadow-2xl" />
                  ) : (
                    <div className="w-56 h-56 bg-orange-50 rounded-full border-4 border-orange-100 animate-pulse flex items-center justify-center">
                       <i className="fa-solid fa-gift text-orange-200 text-6xl"></i>
                    </div>
                  )}
                </div>

                {/* START QUEST Button at the bottom */}
                <div className="w-full flex flex-col gap-4 items-center mb-4 z-20">
                  <button onClick={() => setGameState(GameState.ARENA_SELECT)} 
                          className="group relative w-full bg-[#FF6B6B] border-b-[8px] border-[#8B0000] rounded-[2.5rem] py-6 text-white font-black text-4xl uppercase shadow-xl active:translate-y-1 active:border-b-0 transition-all hover:scale-[1.03] hover:brightness-110">
                    <span className="relative z-10">START QUEST</span>
                  </button>
                  
                  {/* Progress label */}
                  <div className="flex items-center gap-2">
                    <span className="font-black text-[#8B4513]/40 text-[10px] uppercase tracking-widest">Adventure Stage</span>
                    <span className="font-black text-[#FF8C42] text-xl tabular-nums leading-none">{unlockedLevel}/10</span>
                  </div>
                </div>

                {/* Background decorative flair inside the card */}
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-orange-50/50 to-transparent pointer-events-none opacity-40"></div>
             </div>
          </div>
        )}

        {gameState === GameState.ARENA_SELECT && (
          <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center p-4 animate-fade-in bg-[#1a0b2e]/95 backdrop-blur-lg overflow-y-auto">
            <button onClick={() => setGameState(GameState.MENU)} className="absolute top-6 left-6 w-14 h-14 bg-white/10 backdrop-blur-md border-2 border-purple-500 rounded-2xl flex items-center justify-center shadow-lg active:translate-y-1 active:shadow-none transition-all z-[210] hover:bg-white/20">
              <i className="fa-solid fa-arrow-left text-purple-400 text-2xl"></i>
            </button>
            <div className="w-full max-w-[1000px] py-6 px-4 flex flex-col items-center scale-90 sm:scale-95 lg:scale-100 origin-center">
               <div className="flex flex-col items-center mb-10 gap-3">
                 <h2 className="text-6xl sm:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 uppercase italic tracking-tighter leading-none filter drop-shadow-[0_0_15px_rgba(168,85,247,0.4)]">MODE SELECT</h2>
                 <div className="bg-purple-900/40 border border-purple-500/30 px-8 py-2 rounded-full shadow-[0_0_20px_rgba(168,85,247,0.1)]">
                   <p className="text-purple-300 font-bold uppercase tracking-[0.3em] text-[10px]">FIND HIDDEN DIAMONDS & JACKPOTS!</p>
                 </div>
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl">
                 {[
                   { 
                     id: 'Easy', 
                     balls: 15, 
                     desc: 'Casual Toss', 
                     ballSkin: (
                       <div className="relative w-20 h-20 bg-white rounded-full shadow-[0_0_25px_rgba(255,255,255,0.3)] flex items-center justify-center overflow-hidden border-4 border-cyan-400">
                          <div className="absolute top-2 left-4 w-5 h-2 bg-white/40 rounded-full blur-[2px]"></div>
                          <i className="fa-solid fa-face-smile text-cyan-500 text-4xl"></i>
                       </div>
                     )
                   },
                   { 
                     id: 'Medium', 
                     balls: 10, 
                     desc: 'Fixed Pro Challenge', 
                     ballSkin: (
                       <div className="relative w-20 h-20 bg-purple-100 rounded-full shadow-[0_0_30px_rgba(168,85,247,0.3)] flex items-center justify-center overflow-hidden border-4 border-purple-500">
                          <div className="absolute top-1 left-3 w-6 h-3 bg-white/60 rounded-full blur-[2px]"></div>
                          <div className="w-full h-5 bg-purple-600 absolute rotate-12 flex items-center justify-center"><span className="text-[8px] font-black text-white">PRO</span></div>
                          <i className="fa-solid fa-bolt text-purple-800 text-4xl"></i>
                       </div>
                     )
                   },
                   { 
                     id: 'Hard', 
                     balls: 5, 
                     desc: 'Master Goal 1250+', 
                     ballSkin: (
                       <div className="relative w-20 h-20 bg-amber-400 rounded-full shadow-[0_0_40px_rgba(245,158,11,0.5)] flex items-center justify-center overflow-hidden border-4 border-white animate-pulse">
                          <div className="absolute inset-0 bg-gradient-to-tr from-orange-600/40 to-transparent"></div>
                          <div className="absolute top-1 left-3 w-8 h-4 bg-white/80 rounded-full blur-[2px]"></div>
                          <i className="fa-solid fa-crown text-white text-4xl drop-shadow-md"></i>
                       </div>
                     )
                   }
                 ].map((lvl) => (
                   <div key={lvl.id} 
                        className={`group relative bg-[#120626] rounded-[3rem] border-2 p-8 flex flex-col items-center cursor-pointer transition-all duration-300 hover:scale-[1.03] overflow-hidden ${difficulty === lvl.id ? `border-purple-400 shadow-[0_0_30px_rgba(168,85,247,0.2)] bg-[#1e0a3d]` : 'border-purple-900/40 opacity-70'}`} 
                        onClick={() => setDifficulty(lvl.id as Difficulty)}>
                     
                     <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-40"></div>
                     
                     <div className={`text-base font-black uppercase mb-6 tracking-[0.3em] ${difficulty === lvl.id ? 'text-purple-200' : 'text-purple-800'}`}>{lvl.id}</div>
                     
                     <div className="relative w-40 h-48 flex flex-col items-center mb-6">
                        <div className="absolute bottom-0 w-24 h-8 bg-gradient-to-b from-[#2d1252] to-[#0d041a] rounded-lg border-t border-purple-500/30"></div>
                        <div className="relative w-32 h-36 bg-gradient-to-b from-white/10 to-transparent border-t border-x border-white/10 rounded-t-full flex items-center justify-center shadow-inner overflow-hidden">
                           <div className="transform group-hover:scale-110 transition-transform duration-300">{lvl.ballSkin}</div>
                        </div>
                        <div className="absolute top-5 right-8 w-3 h-20 bg-white/10 rounded-full blur-[3px] rotate-[-15deg]"></div>
                     </div>

                     <div className="flex flex-col items-center gap-1">
                        <span className={`font-black text-3xl tabular-nums ${difficulty === lvl.id ? 'text-white' : 'text-purple-300/60'}`}>{lvl.balls} Balls</span>
                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-purple-400/50 text-center leading-tight">{lvl.desc}</span>
                     </div>
                     
                     {difficulty === lvl.id && (
                       <div className="absolute bottom-3 w-1.5 h-1.5 bg-purple-400 rounded-full shadow-[0_0_10px_rgba(168,85,247,1)] animate-pulse"></div>
                     )}
                   </div>
                 ))}
               </div>
               
               <button onClick={() => setGameState(GameState.LEVEL_SELECT)} 
                       className="mt-12 group relative w-full max-w-[500px] bg-gradient-to-r from-purple-600 to-pink-600 border-b-[6px] border-purple-900 rounded-[2.5rem] py-8 text-white font-black text-4xl uppercase shadow-2xl active:translate-y-1 active:border-b-0 transition-all hover:brightness-110 tracking-[0.05em] overflow-hidden">
                  <span className="relative z-10">OPEN WORLD MAP</span>
               </button>
            </div>
          </div>
        )}

        {gameState === GameState.LEVEL_SELECT && (
          <div className="absolute inset-0 z-[200] flex flex-col items-center p-8 animate-fade-in bg-black/70 backdrop-blur-sm overflow-y-auto custom-scrollbar">
            <button onClick={() => setGameState(GameState.ARENA_SELECT)} className="absolute top-10 left-10 w-20 h-20 bg-white border-4 border-[#FF8C42] rounded-[2rem] flex items-center justify-center shadow-[0_8px_0_#8B4513] active:translate-y-1 active:shadow-none transition-all z-[210]"><i className="fa-solid fa-arrow-left text-[#FF8C42] text-4xl"></i></button>
            <div className="w-full max-w-[900px] flex flex-col items-center py-24 relative min-h-screen text-center">
               <h2 className="text-9xl font-black text-white uppercase italic tracking-tighter drop-shadow-lg mb-4">MAP</h2>
               <p className="text-yellow-400 font-black uppercase tracking-[0.5em] text-sm mb-20">{difficulty} MODE ADVENTURE</p>
               <div className="relative w-full flex flex-col items-center gap-24">
                 <div className="absolute top-0 bottom-0 w-3 bg-gradient-to-b from-red-500 via-orange-500 to-yellow-500 rounded-full"></div>
                 {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                   const offset = Math.sin(num * 1.3) * 180;
                   const isCompleted = num < unlockedLevel; const isLocked = num > unlockedLevel;
                   return (
                     <div key={num} style={{ transform: `translateX(${offset}px)` }} className={`group relative z-10 w-40 h-40 rounded-[3.5rem] flex items-center justify-center transition-all duration-500 ${isLocked ? 'grayscale opacity-50 cursor-not-allowed scale-90' : 'cursor-pointer hover:scale-110'} ${num === unlockedLevel ? 'bg-yellow-400 border-[10px] border-white ring-[20px] ring-yellow-400/30 shadow-[0_0_80px_rgba(250,204,21,1)]' : isCompleted ? 'bg-[#FF6B6B] border-[8px] border-white/50 opacity-90' : 'bg-white/30 border-[8px] border-white/10'}`} onClick={() => { if (!isLocked) { setCurrentLevel(num); setGameState(GameState.INSTRUCTIONS); } else showToast("LOCKED", WIDTH/2, HEIGHT/2); }}>
                       <span className="text-7xl font-black text-white leading-none">{isLocked ? <i className="fa-solid fa-lock text-5xl"></i> : num}</span>
                       {isCompleted && <div className="absolute -top-5 -right-5 w-14 h-14 bg-green-500 rounded-2xl flex items-center justify-center border-4 border-white shadow-xl"><i className="fa-solid fa-check text-white text-3xl"></i></div>}
                     </div>
                   );
                 })}
               </div><div className="h-60"></div>
            </div>
          </div>
        )}

        {gameState === GameState.INSTRUCTIONS && (
          <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center p-8 animate-fade-in bg-black/50 backdrop-blur-[2px]">
            <button onClick={() => setGameState(GameState.LEVEL_SELECT)} className="absolute top-10 left-10 w-20 h-20 bg-white border-4 border-[#FF8C42] rounded-[2rem] flex items-center justify-center shadow-[0_8px_0_#8B4513] active:translate-y-1 active:shadow-none transition-all z-[210]"><i className="fa-solid fa-arrow-left text-[#FF8C42] text-4xl"></i></button>
            <div className="w-full max-w-2xl bg-white/95 backdrop-blur-2xl border-[20px] border-[#FF8C42] rounded-[6rem] p-16 shadow-[0_70px_120px_-30px_rgba(0,0,0,0.8)] text-center">
               <h2 className="text-8xl font-black text-[#FF8C42] mb-12 uppercase italic leading-none">STAGE {currentLevel}</h2>
               <div className="bg-orange-50 border-4 border-orange-100 rounded-[3rem] p-10 mb-12 flex flex-col items-center gap-4">
                  <span className="text-[#8B4513]/40 font-black uppercase tracking-[0.4em] text-sm">Target Earnings</span>
                  <span className="text-8xl font-black text-[#FF6B6B] tabular-nums animate-realistic-pop-static">${currentGoal}</span>
                  <p className="text-xs text-yellow-600 font-bold uppercase tracking-widest mt-4">Look out for hidden rewards inside cups!</p>
               </div>
               <button onClick={startCountdown} className="w-full bg-[#FF6B6B] border-[10px] border-[#8B0000] rounded-[4.5rem] py-12 text-white font-black text-6xl uppercase shadow-[0_25px_0_#8B0000] active:translate-y-2 active:shadow-none transition-all hover:scale-103">LET'S TOSS</button>
            </div>
          </div>
        )}

        {gameState === GameState.COUNTDOWN && (
          <div className="absolute inset-0 z-[300] flex flex-col items-center justify-center pointer-events-none bg-black/30 backdrop-blur-[10px]">
             <div className="text-[25rem] font-black text-white italic drop-shadow-[0_40px_0_#8B4513] animate-ping-once tracking-tighter">{countdown}</div>
          </div>
        )}

        {gameState === GameState.GAMEOVER && (
          <div className="absolute inset-0 z-[300] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-8 text-center animate-fade-in overflow-hidden">
             {targetMet && confettiItems.map((c, i) => ( <ConfettiParticle key={i} delay={c.delay} left={c.left} color={c.color} /> ))}
             <div className="w-full max-w-3xl bg-white border-[20px] border-[#FF8C42] rounded-[8rem] p-20 shadow-[0_100px_200px_-40px_rgba(0,0,0,1)] relative animate-scale-bounce">
                <div className="absolute -top-28 left-1/2 -translate-x-1/2 w-56 h-56 bg-white border-[16px] border-[#FF8C42] rounded-full flex items-center justify-center shadow-3xl z-10"><i className={`fa-solid ${targetMet ? 'fa-trophy text-[#FFB000]' : 'fa-circle-xmark text-red-500'} text-[10rem]`}></i></div>
                <div className="flex flex-col items-center mt-20 mb-10 gap-4 relative z-10"><h2 className="text-9xl font-black text-[#FF8C42] uppercase italic leading-none">{targetMet ? 'WINNER!' : 'MISS!'}</h2><p className="font-black uppercase tracking-[0.5em] text-sm opacity-50">{targetMet ? 'GOAL SMASHED' : `NEEDED $${currentGoal}`}</p></div>
                <div className="bg-gradient-to-b from-[#FFF7EE] to-white px-12 py-16 rounded-[6rem] border-4 border-[#E6935E] mb-16 shadow-inner flex flex-col items-center">
                    <span className="text-[#8B4513] text-lg font-black uppercase tracking-[0.6em] opacity-40">Profit Collected</span><span className={`text-[13rem] font-black leading-none animate-grow ${targetMet ? 'text-green-500' : 'text-red-500'}`}>${score}</span>
                    <div className="w-full h-8 bg-gray-100 rounded-full mt-8 overflow-hidden border-2 border-gray-200"><div className={`h-full transition-all duration-1000 ${targetMet ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, (score/currentGoal)*100)}%` }}></div></div>
                </div>
                <div className="flex flex-col md:flex-row gap-8 relative z-10 w-full">
                  <button onClick={() => setGameState(GameState.LEVEL_SELECT)} className="group flex-1 bg-white border-4 border-[#E6935E] rounded-[4rem] py-8 text-[#8B4513] font-black text-2xl uppercase shadow-[0_12px_0_#DDD] active:translate-y-2 active:shadow-none transition-all">WORLD MAP</button>
                  <button onClick={() => { if (targetMet) { if (currentLevel < 10) { setCurrentLevel(currentLevel + 1); setGameState(GameState.LEVEL_SELECT); } else { setGameState(GameState.MENU); } } else { startCountdown(); } }} className={`group flex-[1.7] border-[10px] rounded-[4rem] py-8 text-white font-black text-4xl uppercase active:translate-y-2 active:shadow-none transition-all ${targetMet ? 'bg-gradient-to-b from-[#22c55e] to-[#16a34a] border-[#14532d] shadow-[0_20px_0_#14532d]' : 'bg-gradient-to-b from-[#FF6B6B] to-[#E63946] border-[#8B0000] shadow-[0_20px_0_#8B0000]'}`}>{targetMet ? (currentLevel < 10 ? 'NEXT LEVEL' : 'FINISHED') : 'RETRY STAGE'}</button>
                </div>
             </div>
          </div>
        )}

        {toast && (
          <div style={{ left: (toast.x / WIDTH) * 100 + '%', top: (toast.y / HEIGHT) * 100 + '%' }} className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 animate-realistic-pop z-[200]">
            <span className={`text-[12rem] font-black italic drop-shadow-[0_20px_0_black] leading-none ${toast.colorClass || 'text-yellow-400'}`}>
              {toast.message}
            </span>
          </div>
        )}
      </main>

      <style>{`
        @keyframes confetti-fall { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(800px) rotate(720deg); opacity: 0; } }
        @keyframes scale-bounce { 0% { transform: scale(0.7); opacity: 0; } 65% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes grow { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes realistic-pop { 0% { transform: translate(-50%, 0) scale(0.3); opacity: 0; } 25% { transform: translate(-50%, -70px) scale(1.3); opacity: 1; } 100% { transform: translate(-50%, -400px) scale(2.0); opacity: 0; } }
        @keyframes realistic-pop-static { 0% { transform: scale(0.4); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes fade-in { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ping-once { 0% { transform: scale(0.1); opacity: 0; } 45% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-15px); } }
        .animate-float { animation: float 4s ease-in-out infinite; }
        .animate-confetti-fall { animation: confetti-fall 4.5s linear infinite; }
        .animate-scale-bounce { animation: scale-bounce 0.7s cubic-bezier(0.19, 1, 0.22, 1) forwards; }
        .animate-grow { animation: grow 2s infinite ease-in-out; }
        .animate-fade-in { animation: fade-in 0.7s cubic-bezier(0.19, 1, 0.22, 1) forwards; }
        .animate-realistic-pop { animation: realistic-pop 1.8s cubic-bezier(0.19, 1, 0.22, 1) forwards; }
        .animate-realistic-pop-static { animation: realistic-pop-static 0.5s cubic-bezier(0.19, 1, 0.22, 1) forwards; }
        .animate-ping-once { animation: ping-once 0.8s cubic-bezier(0.19, 1, 0.22, 1) forwards; }
        .custom-scrollbar::-webkit-scrollbar { width: 12px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #FF8C42; border-radius: 20px; }
      `}</style>
    </div>
  );
};

export default App;
