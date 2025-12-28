
# Ping Pong Cup Money Toss: Game Plan

## 1. Game Plan
- **Goal**: Accumulate the highest total "cash" score by successfully landing ping pong balls into red solo cups.
- **Rules**: 
    - You start with **10 balls** per round.
    - 5 cups are arranged in a horizontal line with varying distances and values.
    - Pull back to aim and determine power (sling-shot style).
- **Cups & Values**:
    - Outer Cups: $10 (Easiest)
    - Mid-Outer: $25
    - Center Cup: $100 (Hardest/Smallest target)

## 2. Game States
- **START**: The landing screen with "Start Game" button and instructions.
- **AIMING**: User is actively clicking/dragging to set the trajectory.
- **THROWN**: The ball is in the air, governed by gravity and velocity.
- **SCORED/MISSED**: Result animation after the ball lands or falls off-screen.
- **GAME OVER**: Final score display with a "Play Again" option and AI performance review.

## 3. Build Checklist
- [x] **UI**: Tailwind-based HUD for Score, Balls Left, and AI Commentary box.
- [x] **Canvas Drawing**: 2D context rendering of the "table" and 3D-looking red cups.
- [x] **Controls**: Pointer events (Mouse/Touch) for intuitive drag-and-release mechanics.
- [x] **Physics**: Projectile motion equations (gravity + initial velocity) and basic collision detection for cup "rims".
- [x] **Scoring**: Logic to detect if a ball's coordinate is within a cup's bounds at the end of its arc.
- [x] **Difficulty**: Cup hitboxes shrink slightly or wind is added as the score increases.
- [x] **Gemini Integration**: 'The Announcer' provides real-time roasting or cheering based on toss results.
