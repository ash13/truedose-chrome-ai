// Analyze whether research papers support or contradict a claim
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
    const { claim, papers } = req.body;

    if (!claim || typeof claim !== 'string') {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(400).json({
        error: 'Missing or invalid claim parameter'
      });
    }

    if (!Array.isArray(papers) || papers.length === 0) {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(400).json({
        error: 'Missing or invalid papers array'
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Build batch prompt with all papers
    const papersText = papers.map((paper, idx) => {
      return `PAPER ${idx + 1}:
Title: ${paper.title}
Summary: ${paper.summary || paper.abstract?.substring(0, 500) || 'No summary available'}
Study Type: ${paper.studyMetadata?.studyType || 'not reported'}
Sample Size: ${paper.studyMetadata?.sampleSize || 'not reported'}
Significant: ${paper.studyMetadata?.statistics?.significant === true ? 'Yes' : paper.studyMetadata?.statistics?.significant === false ? 'No' : 'Unknown'}
`;
    }).join('\n---\n');

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are analyzing research papers to determine if they support or contradict a health claim.

For EACH paper, determine:

**POSITIVE** - Paper SUPPORTS the claim:
- Findings align with claim
- Evidence confirms claim
- Recommends action stated in claim
- Example: Claim is "avoid soy" → Paper says "soy interferes with thyroid"

**NEGATIVE** - Paper CONTRADICTS the claim:
- Findings oppose claim
- Evidence refutes claim
- Recommends opposite of claim
- Example: Claim is "avoid soy" → Paper says "soy is safe for thyroid patients"

**NEUTRAL** - Unclear or mixed evidence:
- Inconclusive findings
- Mixed results
- No clear stance
- Study limitations prevent conclusion

IMPORTANT:
- Focus on study conclusions, not just methodology
- Consider statistical significance (significant findings = stronger stance)
- Weight by study quality (RCT > observational > case study)
- Be decisive but accurate

Return ONLY valid JSON: {"results": [{"paper_num": 1, "sentiment": "POSITIVE", "confidence": 0.8, "reason": "brief explanation"}, ...]}`
        },
        {
          role: 'user',
          content: `Claim: "${claim}"\n\n${papersText}`
        }
      ],
      temperature: 0.2,
      max_tokens: 1000
    });

    let paperAnalysis;
    try {
      let content = response.choices[0].message.content.trim();
      console.log('🤖 OpenAI Raw Response:', content);

      // Strip markdown code blocks if present
      if (content.startsWith('```')) {
        content = content.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '');
        console.log('🔧 Stripped markdown, clean JSON:', content);
      }

      paperAnalysis = JSON.parse(content);
      console.log('📊 Parsed paper analysis:', JSON.stringify(paperAnalysis, null, 2));

      // Handle both array and object with array property
      const results = Array.isArray(paperAnalysis) ? paperAnalysis :
                     (paperAnalysis.results || paperAnalysis.sentiments || []);

      console.log('✅ Final results being returned:', JSON.stringify(results, null, 2));

      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(200).json({
        results,
        model: response.model
      });
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      // Fallback: return neutral sentiments for all papers
      const fallback = papers.map((_, idx) => ({
        paper_num: idx + 1,
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
    console.error('Paper analysis error:', error);
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(500).json({
      error: 'Paper analysis failed',
      details: error.message
    });
  }
};
