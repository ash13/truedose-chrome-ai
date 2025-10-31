// api/rephrase.js (CommonJS + CORS for MV3 extension)
const OpenAI = require('openai');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { claim } = req.body || {};
    if (!claim || typeof claim !== 'string') {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(400).json({ error: 'claim (string) is required' });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Rephrase health claims into concise medical keywords for PubMed search. Output ONLY 3-6 keywords, no explanations. Examples:\n"coffee lowers diabetes risk" → "coffee diabetes risk"\n"people with hypothyroidism should avoid soy" → "soy hypothyroidism thyroid"\n"vitamin D prevents colds" → "vitamin D cold prevention"'
        },
        {
          role: 'user',
          content: claim
        }
      ],
      temperature: 0.3,
      max_tokens: 30
    });

    const query = response.choices[0].message.content.trim();

    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).json({ query });

  } catch (e) {
    console.error('Rephrasing error:', e);
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(500).json({ error: 'rephrasing_failed', message: e.message });
  }
};
