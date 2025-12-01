
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Port } from "../types";

// Initialize Gemini
// Note: In a production Vite app, this would usually be import.meta.env.VITE_API_KEY, 
// but we adhere to the instruction to use process.env.API_KEY directly.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Uses Gemini to map a natural language query (e.g. "Chicago to Shanghai") 
 * to specific Port IDs from the provided list.
 */
export const parseShippingIntent = async (
  query: string,
  availablePorts: Port[]
): Promise<{ originId: string | null; destinationId: string | null; error?: string }> => {
  
  // Create a simplified map of ports for the context window to save tokens
  const portContext = availablePorts.map(p => ({
    id: p.id,
    name: p.name,
    code: p.code,
    country: p.country,
    type: p.type
  }));

  const systemInstruction = `
    You are a logistics intent parser. 
    You have access to a list of ports with IDs, Names, and Codes.
    Map the user's natural language request to the most likely 'originId' and 'destinationId' from the list.
    
    Rules:
    1. Fuzzy match city names (e.g., "Munich" -> "Munich Inland Hub").
    2. If the user mentions a country, pick the major port in that country from the list.
    3. If a location is not found in the list, return null for that ID.
  `;

  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      originId: { type: Type.STRING, description: "The ID of the origin port found in the list, or null." },
      destinationId: { type: Type.STRING, description: "The ID of the destination port found in the list, or null." },
      reasoning: { type: Type.STRING, description: "Short explanation of the mapping." }
    },
    required: ["originId", "destinationId"]
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `User Query: "${query}"\n\nAvailable Ports: ${JSON.stringify(portContext)}`,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.1, // Low temperature for deterministic mapping
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text);
  } catch (error) {
    console.error("AI Parse Error:", error);
    return { originId: null, destinationId: null, error: "Failed to parse intent." };
  }
};

/**
 * Uses Gemini with Google Search Grounding to find real-time status/risks for a port.
 */
export const getPortInsights = async (port: Port): Promise<{ summary: string; sources: {title: string, uri: string}[] }> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // Flash is sufficient for search summarization
      contents: `Find recent logistics news, port congestion status, weather alerts, or labor strike updates for the ${port.name} (${port.code}) in ${port.country}. Summarize the current operational status and any risks in 3 bullet points.`,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.7,
      }
    });

    const text = response.text || "No insights available.";
    
    // Extract grounding metadata if available
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks
      .filter((c: any) => c.web)
      .map((c: any) => ({ title: c.web.title, uri: c.web.uri }));

    return { summary: text, sources };
  } catch (error) {
    console.error("AI Insight Error:", error);
    return { summary: "Unable to fetch live insights at this time.", sources: [] };
  }
};
