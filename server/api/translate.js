// Translate text using OpenAI
const OpenAI = require('openai');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const LANGUAGE_NAMES = {
  'es': 'Spanish',
  'ja': 'Japanese',
  'en': 'English'
};

module.exports = async (req, res) => {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, targetLanguage } = req.body;

    if (!text || typeof text !== 'string') {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(400).json({
        error: 'Missing or invalid text parameter'
      });
    }

    if (!targetLanguage || !LANGUAGE_NAMES[targetLanguage]) {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(400).json({
        error: 'Missing or invalid targetLanguage (must be: en, es, ja)'
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Translate the following text to ${LANGUAGE_NAMES[targetLanguage]}. Maintain the formatting and tone.`
        },
        { role: 'user', content: text }
      ],
      temperature: 0.2,
      max_tokens: 1000
    });

    const translation = response.choices[0].message.content.trim();

    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).json({
      translation,
      targetLanguage,
      model: response.model
    });

  } catch (error) {
    console.error('Translation error:', error);
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(500).json({
      error: 'Translation failed',
      details: error.message
    });
  }
};
