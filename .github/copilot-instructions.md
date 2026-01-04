# Copilot / AI Agent Instructions for this repo

This is a small React + Vite single-page game that uses Google GenAI for in-game commentary and image generation. The goal of this document is to help an AI coding agent become productive quickly by pointing to concrete patterns, integration points, and dev workflows.

- **Big picture:** The game UI and logic live in [App.tsx](App.tsx). It renders a canvas-based sling/throw game and drives state transitions defined in [types.ts](types.ts).
- **AI integration:** The repo uses `@google/genai` in `services/commentaryService.ts` and `services/geminiService.ts` to call Gemini models. Agents should follow the existing usage: instantiate `new GoogleGenAI({ apiKey: process.env.API_KEY })` and call `ai.models.generateContent({...})` returning `response.text` (or image `parts.inlineData` for image payloads).
- **Environment & build:** Set `GEMINI_API_KEY` in `.env.local`. The project maps this in [vite.config.ts](vite.config.ts) to `process.env.API_KEY`. Common commands (from `package.json`):
  - `npm install`
  - `npm run dev` (dev server; defaults to port 3000, host 0.0.0.0)
  - `npm run build` / `npm run preview`
- **Key files to inspect when changing behavior:**
  - [App.tsx](App.tsx) — main game loop, rendering, physics constants, calls `getCommentary` and background generation.
  - [types.ts](types.ts) — canonical types and enums used across the app (`GameState`, `RewardType`, `Cup`, `Ball`).
  - [services/commentaryService.ts](services/commentaryService.ts) and [services/geminiService.ts](services/geminiService.ts) — examples of model usage for text and images.
  - [vite.config.ts](vite.config.ts) — shows how env vars are wired into the client build.

- **Patterns & conventions (project-specific):**
  - AI calls are synchronous/`await`-based and expect `response.text` for strings; image outputs may appear in `response.candidates[0].content.parts` with `inlineData.data` (base64). See `generateBackground` in [App.tsx](App.tsx).
  - Use the single shared `process.env.API_KEY` pattern in services to keep a consistent key usage across files.
  - UI state is centralized in React state + refs in `App.tsx` (e.g., `ballsLeftRef`, `cupsRef`). Prefer following those existing refs when mutating game objects to avoid re-render issues.
  - Small helper services export single functions (e.g., `getCommentary`) — follow that simple pattern for new AI helper modules.

- **When modifying AI prompts or models:**
  - Keep prompts short (the codebase asks for <15 words for commentary in existing prompts). Match style: playful, sarcastic announcer.
  - Preserve fallback behavior seen in the services: graceful fallback strings and console error logging if the AI call fails.

- **Testing and debugging tips:**
  - Run `npm run dev` and open the app to exercise canvas behavior quickly.
  - To debug AI responses locally, add console logs in `services/commentaryService.ts` and `services/geminiService.ts` before returning results.
  - If changing env wiring, update [vite.config.ts](vite.config.ts) and restart the dev server.

- **Examples (copyable patterns):**
  - Instantiate client: `const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });`
  - Text completion: `const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt }); return response.text;`
  - Image generation: inspect `response.candidates[0].content.parts` and use `part.inlineData.data` as base64 image.

If anything here is unclear or you want me to expand a section (for example add more code examples or list more files), tell me which part to improve and I will iterate.
