// Extract study metadata (demographics + statistical significance) from abstracts
const OpenAI = require('openai');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
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
    const { abstract, title } = req.body;

    if (!abstract || typeof abstract !== 'string') {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(400).json({
        error: 'Missing or invalid abstract parameter'
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a research methodology expert. Extract study metadata from this medical research abstract.

Return ONLY valid JSON with this exact structure (use "not reported" for missing fields):
{
  "studyType": "randomized controlled trial" | "meta-analysis" | "systematic review" | "observational study" | "case study" | "not reported",
  "sampleSize": number or "not reported",
  "demographics": {
    "age": "mean age or age range" or "not reported",
    "gender": "X% female" or "gender distribution" or "not reported",
    "population": "description of participants (e.g., 'hypothyroid patients', 'healthy adults')" or "not reported",
    "location": "country or region" or "not reported"
  },
  "statistics": {
    "pValue": "p-value if reported (e.g., 'p < 0.05', 'p = 0.03')" or "not reported",
    "confidenceInterval": "CI if reported (e.g., '95% CI: 1.2-3.4')" or "not reported",
    "effectSize": "effect size or key finding (e.g., '25% reduction', 'OR 1.5')" or "not reported",
    "significant": true | false | null
  }
}`
        },
        {
          role: 'user',
          content: `Title: ${title}\n\nAbstract: ${abstract}`
        }
      ],
      temperature: 0.1,
      max_tokens: 400
    });

    let metadata;
    try {
      const content = response.choices[0].message.content.trim();
      metadata = JSON.parse(content);

      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(200).json(metadata);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      // Fallback: return empty metadata
      const fallback = {
        studyType: 'not reported',
        sampleSize: 'not reported',
        demographics: {
          age: 'not reported',
          gender: 'not reported',
          population: 'not reported',
          location: 'not reported'
        },
        statistics: {
          pValue: 'not reported',
          confidenceInterval: 'not reported',
          effectSize: 'not reported',
          significant: null
        }
      };

      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(200).json(fallback);
    }

  } catch (error) {
    console.error('Metadata extraction error:', error);
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(500).json({
      error: 'Metadata extraction failed',
      details: error.message
    });
  }
};
