
export enum GameState {
  MENU = 'MENU',
  ARENA_SELECT = 'ARENA_SELECT',
  LEVEL_SELECT = 'LEVEL_SELECT',
  INSTRUCTIONS = 'INSTRUCTIONS',
  COUNTDOWN = 'COUNTDOWN',
  AIMING = 'AIMING',
  THROWN = 'THROWN',
  GAMEOVER = 'GAMEOVER'
}

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export type RewardType = 'money' | 'jackpot' | 'life' | 'balls' | 'diamond' | 'bomb';

export interface Cup {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
  label: string;
  rewardType: RewardType;
  isRevealed: boolean;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  inCup: boolean;
  active: boolean;
}

export interface Vector2D {
  x: number;
  y: number;
}
