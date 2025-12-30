
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getCommentary = async (type: 'hit' | 'miss' | 'gameover', score: number, ballsLeft: number) => {
  try {
    const prompt = `You are a sarcastic but fun sports announcer for a "Ping Pong Cup Mystery Toss" game. 
    The player just ${type === 'hit' ? 'made a shot and revealed a hidden reward' : type === 'miss' ? 'completely missed the cup' : 'finished the whole session'}. 
    Current Score: $${score}. 
    Shots Left: ${ballsLeft}. 
    Keep it under 15 words. Be witty and energetic. Use casual gaming slang.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    
    return response.text?.trim() || "Keep tossing!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return type === 'hit' ? "NICE SHOT!" : "So close...";
  }
};
