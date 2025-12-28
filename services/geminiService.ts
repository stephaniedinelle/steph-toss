
import { GoogleGenAI } from "@google/genai";

// Always use const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getCommentary = async (type: 'hit' | 'miss' | 'gameover', score: number, ballsLeft: number) => {
  try {
    const prompt = `You are a sarcastic but fun sports announcer for a "Ping Pong Cup Money Toss" game. 
    The player just ${type === 'hit' ? 'made a shot' : type === 'miss' ? 'missed a shot' : 'finished the game'}. 
    Current Score: $${score}. 
    Balls Left: ${ballsLeft}. 
    Keep it under 15 words. Be witty.`;

    // Use ai.models.generateContent with the model name and string prompt directly.
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    
    // Use the .text property to extract the generated string output.
    return response.text || "Keep tossing!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return type === 'hit' ? "NICE SHOT!" : "So close...";
  }
};
