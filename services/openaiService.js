/**
 * OpenAI Service
 * 
 * Handles OpenAI API integration for auto-generating tool group instructions.
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

/**
 * Generate instructions for a tool group using OpenAI
 * @param {string} groupName - The name of the tool group
 * @param {Array} tools - Array of tool objects with name and description
 * @returns {Promise<string>} Generated instructions
 */
export async function generateInstructions(groupName, tools) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const toolDescriptions = tools.map(tool => 
    `- ${tool.name}: ${tool.description}`
  ).join('\n');

  const systemPrompt = `You are an expert at creating concise, actionable instructions for AI tool groups. 
Based on the tool group name and available tools, create clear instructions that explain:
1. What the tool group does
2. When to use it
3. How the tools work together

Keep instructions under 200 words and focus on practical usage.`;

  const userPrompt = `Tool Group: "${groupName}"

Available Tools:
${toolDescriptions}

Generate concise instructions for this tool group:`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 300,
      temperature: 0.7
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw new Error('Failed to generate instructions using OpenAI');
  }
} 