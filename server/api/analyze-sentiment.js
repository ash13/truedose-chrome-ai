// Batch analyze sentiment for multiple Reddit posts
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
    const { claim, comments } = req.body;

    if (!claim || typeof claim !== 'string') {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(400).json({
        error: 'Missing or invalid claim parameter'
      });
    }

    if (!Array.isArray(comments) || comments.length === 0) {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(400).json({
        error: 'Missing or invalid comments array'
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Build batch prompt with all individual comments
    const commentsText = comments.map((comment, idx) => {
      return `COMMENT ${idx + 1}:\nFrom: r/${comment.subreddit} - "${comment.post_title}"\nUpvotes: ${comment.score}\nText: ${comment.body.substring(0, 300)}\n`;
    }).join('\n---\n');

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are analyzing Reddit comments about a health claim. Be DECISIVE - look for ANY indication of agreement or disagreement. Do NOT default to neutral.

For EACH comment, determine sentiment:

**POSITIVE** - Supports/agrees with the claim (avoidance is recommended):
- "I cut out soy", "I don't eat soy", "soy are big triggers for me", "I've cut them off"
- "soy interferes with thyroid", "you should avoid soy"
- Lists that exclude soy: "I don't eat gluten, dairy, soy"

**NEGATIVE** - Contradicts/disagrees with the claim (avoidance is NOT needed):
- "I eat soy with no issues", "soy is fine", "soy... are health promoting foods"
- "no reason to cut them out", "There is absolutely no reason to cut them"

**NEUTRAL** - ONLY if truly unclear:
- Questions without answers: "What about almond milk?"
- Generic advice: "consult your doctor", "it depends on the person"
- Completely off-topic

IMPORTANT: If someone mentions avoiding soy → POSITIVE. If someone says soy is healthy/fine → NEGATIVE. Be aggressive with classification.

Return ONLY valid JSON: {"results": [{"comment_num": 1, "sentiment": "POSITIVE", "confidence": 0.8, "reason": "brief explanation"}, ...]}`
        },
        {
          role: 'user',
          content: `Claim: "${claim}"\n\n${commentsText}`
        }
      ],
      temperature: 0.2,
      max_tokens: 1000
    });

    let sentimentData;
    try {
      let content = response.choices[0].message.content.trim();
      console.log('🤖 OpenAI Raw Response:', content);

      // Strip markdown code blocks if present
      if (content.startsWith('```')) {
        content = content.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '');
        console.log('🔧 Stripped markdown, clean JSON:', content);
      }

      sentimentData = JSON.parse(content);
      console.log('📊 Parsed sentiment data:', JSON.stringify(sentimentData, null, 2));

      // Handle both array and object with array property
      const results = Array.isArray(sentimentData) ? sentimentData :
                     (sentimentData.results || sentimentData.sentiments || []);

      console.log('✅ Final results being returned:', JSON.stringify(results, null, 2));

      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(200).json({
        results,
        model: response.model
      });
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      // Fallback: return neutral sentiments for all comments
      const fallback = comments.map((_, idx) => ({
        comment_num: idx + 1,
        sentiment: 'NEUTRAL',
        confidence: 0.5,
        reason: 'Parse error'
      }));

      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(200).json({
        results: fallback,
        model: response.model,
        warning: 'Fallback due to parse error'
      });
    }

  } catch (error) {
    console.error('Sentiment analysis error:', error);
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(500).json({
      error: 'Sentiment analysis failed',
      details: error.message
    });
  }
};
