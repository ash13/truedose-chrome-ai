// server/api/score-features.js  (CommonJS + CORS)
const OpenAI = require('openai');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

module.exports = async (req, res) => {
  // CORS / preflight
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { version, evidence, demographics } = req.body || {};
    if (version !== 'v1' || !evidence) {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(400).json({ error: 'Bad payload' });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const sys =
      'You output strict JSON with numeric feature scores in [0,1]. Keys: research{relevance,design_strength,recency}, community{sentiment_index,coverage,relevance}. No prose.';

    // Trim inputs to safe sizes
    const safeEvidence = {
      claim: String(evidence.claim || '').slice(0, 2000),
      papers: (evidence.papers || []).slice(0, 10).map(p => ({
        pmid: String(p.pmid || ''),
        title: String(p.title || '').slice(0, 500),
        year: p.year ?? null,
        relevanceScore: typeof p.relevanceScore === 'number' ? p.relevanceScore : null,
        summary: String(p.summary || '').slice(0, 2000)
      })),
      posts: (evidence.posts || []).slice(0, 12).map(x => ({
        subreddit: String(x.subreddit || '').slice(0, 80),
        title: String(x.title || '').slice(0, 300),
        score: Number.isFinite(x.score) ? x.score : 0,
        relevance: typeof x.relevance === 'number' ? x.relevance : 0
      })),
      community: {
        positive: Number(evidence.community?.positive || 0),
        negative: Number(evidence.community?.negative || 0),
        neutral: Number(evidence.community?.neutral || 0),
        sample: Number(evidence.community?.sample || 0)
      }
    };

    const user = {
      instruction: `Grade with deterministic rules and return JSON only.
RESEARCH:
- relevance: mean of "relevanceScore" across papers (missing -> 0.5).
- design_strength: meta/RCT≈1.0; prospective≈0.7; case-control≈0.55; cross-sectional≈0.45; case report/letter≈0.25; unknown≈0.5.
- recency: median year → <=3y:1.0; 4–7:0.8; 8–12:0.6; 13–20:0.4; >20:0.2; unknown:0.5.
COMMUNITY:
- sentiment_index: (positive - negative + 1)/2, clamp 0..1; if sample==0 -> 0.5.
- coverage: min(1, sample/10).
- relevance: mean of post "relevance" (0.5 default).`,
      evidence: safeEvidence,
      demographics: demographics || {}
    };

    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      top_p: 1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: JSON.stringify(user) }
      ]
    });

    const raw = resp.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    const clamp = x => Math.max(0, Math.min(1, Number(x) || 0));

    const graded = {
      research: {
        relevance: clamp(parsed?.research?.relevance),
        design_strength: clamp(parsed?.research?.design_strength),
        recency: clamp(parsed?.research?.recency)
      },
      community: {
        sentiment_index: clamp(parsed?.community?.sentiment_index),
        coverage: clamp(parsed?.community?.coverage),
        relevance: clamp(parsed?.community?.relevance)
      }
    };

    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).json(graded);
  } catch (e) {
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(500).json({ error: String(e?.message || e) });
  }
};