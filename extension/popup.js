// TrueDose - Chrome Built-in AI Health Fact Checker
// Research papers only - Uses Chrome AI APIs (Prompt, Summarizer, Translator)
//
// Chrome AI APIs Used:
// - Prompt API (window.ai.languageModel) - Query rephrasing, paper analysis, metadata extraction, fact-check generation
// - Summarizer API (window.ai.summarizer) - Abstract summarization
// - Translator API (window.ai.translator) - Multilingual support (ES, JA)
//
// External APIs (for research papers only):
// - PubMed API - Medical paper search
// - Semantic Scholar API - Citation data and additional papers

// ===== CONFIG =====
// Note: No backend server needed for AI! All AI processing runs client-side via Chrome Built-in AI

// ===== CHROME AI SESSION CACHE =====
// Cache AI sessions to avoid recreating them (improves performance)
let cachedSessions = {
  languageModel: null,
  summarizer: null,
  rewriter: null,
  translator: null
};

// ===== CHROME AI INITIALIZATION =====
// Check if Chrome AI APIs are available
async function checkChromeAIAvailability() {
  const availability = {
    languageModel: typeof LanguageModel !== 'undefined',
    summarizer: typeof Summarizer !== 'undefined',
    rewriter: typeof Rewriter !== 'undefined',
    translator: typeof Translator !== 'undefined'
  };

  console.log('Chrome AI Availability:', availability);
  return availability;
}

// Initialize Chrome AI sessions (called lazily on first use)
async function getLanguageModelSession() {
  if (!cachedSessions.languageModel) {
    if (typeof LanguageModel === 'undefined') {
      throw new Error('Chrome Prompt API not available');
    }
    cachedSessions.languageModel = await LanguageModel.create({
      systemPrompt: "You are a medical fact-checker analyzing health claims using peer-reviewed research. Provide concise, evidence-based analysis.",
      outputLanguage: "en"
    });
    console.log('✓ Chrome Prompt API session created');
  }
  return cachedSessions.languageModel;
}

async function getSummarizerSession() {
  if (!cachedSessions.summarizer) {
    if (typeof Summarizer === 'undefined') {
      throw new Error('Chrome Summarizer API not available');
    }
    cachedSessions.summarizer = await Summarizer.create({
      outputLanguage: "en"
    });
    console.log('✓ Chrome Summarizer API session created');
  }
  return cachedSessions.summarizer;
}

async function getRewriterSession() {
  if (!cachedSessions.rewriter) {
    if (typeof Rewriter === 'undefined') {
      throw new Error('Chrome Rewriter API not available');
    }
    cachedSessions.rewriter = await Rewriter.create({
      outputLanguage: "en"
    });
    console.log('✓ Chrome Rewriter API session created');
  }
  return cachedSessions.rewriter;
}

async function getTranslatorSession(targetLanguage) {
  // Translator sessions are language-specific, so we don't cache them
  if (typeof Translator === 'undefined') {
    throw new Error('Chrome Translator API not available');
  }
  const translator = await Translator.create({
    sourceLanguage: 'en',
    targetLanguage: targetLanguage
  });
  console.log(`✓ Chrome Translator API session created (en → ${targetLanguage})`);
  return translator;
}

// ===== PUBMED FUNCTIONS =====

async function rephraseToMedicalQuery(claim) {
  console.time('  ⏱️  Chrome AI Rephrase');
  try {
    const session = await getLanguageModelSession();

    const prompt = `Convert health statements into search queries for medical research databases.

Your task:
1. Identify the main health topic and any substances/interventions mentioned
2. Keep the core relationship between concepts (avoid, help, cause, treat, etc.)
3. Use medical terms when clear synonyms exist, but don't add concepts
4. Rephrase concisely

Examples:
Input: "people who have hypothyroidism should avoid soy"
Output: hypothyroidism soy effects 

Input: "turmeric helps with joint pain"
Output: curcumin turmeric joint pain arthritis anti-inflammatory effects

Input: "intermittent fasting for weight loss"
Output: intermittent fasting weight loss obesity metabolic effects

Input: "probiotics cure IBS"
Output: probiotics irritable bowel syndrome treatment efficacy

Claim: "${claim}"

Return ONLY the search query, nothing else.`;

    const query = await session.prompt(prompt);
    const cleaned = query.trim();

    console.log(`🔬 Original: "${claim}"`);
    console.log(`🔬 Rephrased via Chrome AI: "${cleaned}"`);
    console.timeEnd('  ⏱️  Chrome AI Rephrase');
    return cleaned;

  } catch (error) {
    console.error('Error rephrasing via Chrome AI:', error);
    // Fallback: remove common words
    const fallback = claim.split(' ')
      .filter(word => word.length > 3 && !['should', 'people', 'avoid', 'have', 'with', 'that', 'this', 'could', 'would', 'every', 'always', 'never'].includes(word.toLowerCase()))
      .slice(0, 5)
      .join(' ');

    console.log(`⚠️ Using fallback keywords: "${fallback}"`);
    return fallback;
  }
}

// Search PubMed for medical papers
async function searchPubMed(medicalQuery) {
  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(medicalQuery)}&retmax=10&retmode=json&sort=relevance`;

    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    const pmids = searchData.esearchresult.idlist;

    if (pmids.length === 0) {
      return [];
    }

    console.log(`  ✓ Found ${pmids.length} papers from PubMed`);

    // Get paper metadata
    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json`;
    const summaryResponse = await fetch(summaryUrl);
    const summaryData = await summaryResponse.json();

    const papers = pmids.map(id => {
      const paper = summaryData.result[id];

      // Clean DOI - remove "doi: " prefix if present
      let doi = paper.elocationid || paper.articleids?.find(id => id.idtype === 'doi')?.value || null;
      if (doi && doi.toLowerCase().startsWith('doi:')) {
        doi = doi.substring(4).trim();
      }

      return {
        title: paper.title,
        authors: paper.authors?.slice(0, 3).map(a => a.name).join(', ') || 'Unknown',
        journal: paper.fulljournalname || paper.source,
        year: paper.pubdate?.split(' ')[0] || 'Unknown',
        pmid: id,
        doi: doi,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        source: 'pubmed'
      };
    });

    return papers;
  } catch (error) {
    console.error('PubMed search error:', error);
    return [];
  }
}

// Search Semantic Scholar
async function searchSemanticScholar(medicalQuery) {
  try {
    const searchUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(medicalQuery)}&fields=title,abstract,authors,year,citationCount,influentialCitationCount,venue,externalIds,url&limit=10`;

    const searchResponse = await fetch(searchUrl);

    if (!searchResponse.ok) {
      if (searchResponse.status === 429) {
        console.warn('⚠️  Semantic Scholar rate limit reached - continuing with PubMed only');
        return [];
      }
      throw new Error(`Semantic Scholar API error: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    const results = searchData.data || [];

    if (results.length === 0) {
      return [];
    }

    console.log(`  ✓ Found ${results.length} papers from Semantic Scholar`);

    const papers = results
      .filter(paper => paper.abstract)
      .map(paper => ({
        title: paper.title,
        authors: paper.authors?.slice(0, 3).map(a => a.name).join(', ') || 'Unknown',
        journal: paper.venue || 'Unknown',
        year: paper.year?.toString() || 'Unknown',
        citations: paper.citationCount || 0,
        influentialCitations: paper.influentialCitationCount || 0,
        paperId: paper.paperId,
        abstract: paper.abstract,
        url: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
        doi: paper.externalIds?.DOI || null,
        pmid: paper.externalIds?.PubMed || null,
        source: 'semantic_scholar'
      }));

    return papers;
  } catch (error) {
    console.warn('⚠️  Semantic Scholar unavailable - continuing with PubMed only:', error.message);
    return [];
  }
}

// Enrich PubMed papers with citation data from Semantic Scholar
async function enrichPubMedWithCitations(pubmedPapers) {
  console.log(`  🔗 Enriching ${pubmedPapers.length} PubMed papers with citation data...`);

  const enrichedPapers = await Promise.all(
    pubmedPapers.map(async (paper) => {
      try {
        // Try to find paper on Semantic Scholar by DOI or PMID
        let s2Data = null;

        if (paper.doi) {
          try {
            const doiUrl = `https://api.semanticscholar.org/graph/v1/paper/DOI:${paper.doi}?fields=abstract,citationCount,influentialCitationCount`;
            const response = await fetch(doiUrl);
            if (response.ok) {
              s2Data = await response.json();
            } else if (response.status === 429) {
              console.warn(`  ⚠️  Rate limited on DOI lookup for ${paper.title.substring(0, 50)}...`);
            }
          } catch (e) {
            // Silently fail on network errors
          }
        }

        if (!s2Data && paper.pmid) {
          try {
            const pmidUrl = `https://api.semanticscholar.org/graph/v1/paper/PMID:${paper.pmid}?fields=abstract,citationCount,influentialCitationCount`;
            const response = await fetch(pmidUrl);
            if (response.ok) {
              s2Data = await response.json();
            } else if (response.status === 429) {
              console.warn(`  ⚠️  Rate limited on PMID lookup`);
            }
          } catch (e) {
            // Silently fail on network errors
          }
        }

        if (s2Data) {
          return {
            ...paper,
            citations: s2Data.citationCount || 0,
            influentialCitations: s2Data.influentialCitationCount || 0,
            abstract: s2Data.abstract || paper.abstract,
            paperId: s2Data.paperId
          };
        }

        return { ...paper, citations: 0, influentialCitations: 0 };
      } catch (error) {
        // Silently handle errors - not critical to have citation counts
        return { ...paper, citations: 0, influentialCitations: 0 };
      }
    })
  );

  console.log(`  ✓ Enrichment complete`);
  return enrichedPapers;
}

// Fetch abstracts for papers missing them
async function fetchMissingAbstracts(papers) {
  const papersNeedingAbstracts = papers.filter(p => !p.abstract && p.pmid);

  if (papersNeedingAbstracts.length === 0) {
    return papers;
  }

  console.log(`Fetching ${papersNeedingAbstracts.length} missing abstracts from PubMed...`);

  for (const paper of papersNeedingAbstracts) {
    try {
      const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${paper.pmid}&retmode=xml`;
      const response = await fetch(fetchUrl);
      const xmlText = await response.text();

      const abstractMatch = xmlText.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g);
      if (abstractMatch) {
        const abstractParts = abstractMatch.map(tag => tag.replace(/<[^>]+>/g, '').trim());
        paper.abstract = abstractParts.join(' ');
      }
    } catch (error) {
      console.warn(`Could not fetch abstract for ${paper.pmid}`);
    }
  }

  return papers;
}

// Hybrid search: PubMed + Semantic Scholar
async function searchHybrid(query) {
  try {
    // Rephrase to medical/scientific language
    const medicalQuery = await rephraseToMedicalQuery(query);

    console.log(`Searching PubMed + Semantic Scholar with: "${medicalQuery}"`);

    // Search both in parallel
    const [pubmedPapers, semanticPapers] = await Promise.all([
      searchPubMed(medicalQuery),
      searchSemanticScholar(medicalQuery)
    ]);

    if (pubmedPapers.length === 0 && semanticPapers.length === 0) {
      console.log('No papers found from either source');
      return { papers: [], count: 0, medicalQuery: medicalQuery };
    }

    // Enrich PubMed papers with citation data from Semantic Scholar
    const enrichedPubMed = await enrichPubMedWithCitations(pubmedPapers);

    // Merge papers (deduplicate by DOI or title)
    const allPapers = [...semanticPapers];
    const seenDOIs = new Set(semanticPapers.map(p => p.doi).filter(Boolean));
    const seenTitles = new Set(semanticPapers.map(p => p.title.toLowerCase()));

    for (const paper of enrichedPubMed) {
      const isDuplicate =
        (paper.doi && seenDOIs.has(paper.doi)) ||
        seenTitles.has(paper.title.toLowerCase());

      if (!isDuplicate) {
        allPapers.push(paper);
        if (paper.doi) seenDOIs.add(paper.doi);
        seenTitles.add(paper.title.toLowerCase());
      }
    }

    console.log(`Total: ${allPapers.length} unique papers (${pubmedPapers.length} PubMed, ${semanticPapers.length} Semantic Scholar)`);

    // Fetch missing abstracts
    await fetchMissingAbstracts(allPapers);

    // Filter out papers without abstracts
    const papersWithAbstracts = allPapers.filter(p => p.abstract);
    console.log(`${papersWithAbstracts.length} papers have abstracts`);

    // Rank by quality score: influential citations + recency
    console.log(`Ranking by influential citations and recency...`);
    const rankedPapers = rankPapersByQualityScore(papersWithAbstracts);

    // Extract study metadata for top 5 papers
    const top5Papers = rankedPapers.slice(0, 5);
    const papersWithMetadata = await extractStudyMetadata(top5Papers);

    console.log(`Returning top ${papersWithMetadata.length} papers with metadata`);
    return {
      papers: papersWithMetadata,
      count: papersWithMetadata.length,
      medicalQuery: medicalQuery
    };

  } catch (error) {
    console.error('Hybrid search error:', error);
    return { papers: [], count: 0, medicalQuery: query, error: error.message };
  }
}

// Rank papers by quality score: influential citations + recency
// No embedding re-ranking needed - APIs already returned relevant papers
function rankPapersByQualityScore(papers) {
  const currentYear = new Date().getFullYear();

  // Calculate quality score for each paper
  const scoredPapers = papers.map((paper) => {
    // Recency score (favor papers from last 10 years)
    const yearInt = parseInt(paper.year) || currentYear;
    const age = currentYear - yearInt;
    const recencyScore = Math.max(0, 1 - (age / 20)); // 1.0 for this year, 0.5 for 10 years, 0.0 for 20+ years

    // Influential citation score (normalize by log scale)
    // Use influential citations (better than raw citations - filters self-citations & citation farms)
    const influentialCount = paper.influentialCitations || 0;
    const influentialScore = Math.log10(influentialCount + 1) / 3.5; // log10(3162) ≈ 3.5, so 3k+ influential = 1.0

    // Quality score: focus on what matters for fact-checking
    const qualityScore =
      (influentialScore * 0.6) +  // 60% - Influential citations (peer validation)
      (recencyScore * 0.4);        // 40% - Recency (current knowledge)

    return {
      ...paper,
      recencyScore,
      influentialScore,
      qualityScore
    };
  });

  // Sort by quality score
  scoredPapers.sort((a, b) => b.qualityScore - a.qualityScore);

  // Log top 5 for debugging
  console.log('Top 5 papers by quality score:');
  scoredPapers.slice(0, 5).forEach((paper, idx) => {
    console.log(`    ${idx + 1}. [${paper.source}] ${paper.title.substring(0, 60)}...`);
    console.log(`       Influential: ${paper.influentialCitations} | Total: ${paper.citations} | Year: ${paper.year} | Quality: ${paper.qualityScore.toFixed(3)}`);
  });

  return scoredPapers;
}

async function fetchAbstracts(papers) {
  // With Semantic Scholar, abstracts are already included in search results!
  // Just format them for the summarize function
  console.log(`Using abstracts from Semantic Scholar (no additional fetching needed)`);

  return papers.map(paper => ({
    paperId: paper.paperId,
    title: paper.title,
    abstract: paper.abstract
  }));
}

// Extract study metadata (demographics + statistical significance) from abstracts
async function extractStudyMetadata(papers) {
  console.log(`Extracting study metadata for ${papers.length} papers...`);
  console.time('Metadata Extraction');

  try {
    const session = await getLanguageModelSession();

    // Extract metadata for all papers in parallel
    const metadataPromises = papers.map(async (paper) => {
      try {
        const prompt = `Extract study metadata from this research paper abstract. Return ONLY a JSON object with these fields:

{
  "studyType": "RCT" | "meta-analysis" | "cohort" | "case-control" | "observational" | "not reported",
  "sampleSize": "exact number or 'not reported'",
  "demographics": {
    "age": "age range/description or 'not reported'",
    "gender": "gender distribution or 'not reported'",
    "population": "population type or 'not reported'"
  },
  "statistics": {
    "pValue": "p-value or 'not reported'",
    "effectSize": "effect size or 'not reported'",
    "significant": true | false | null
  }
}

Title: ${paper.title}
Abstract: ${paper.abstract}

Return ONLY valid JSON, no other text.`;

        const response = await session.prompt(prompt);

        // Parse JSON response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }

        const metadata = JSON.parse(jsonMatch[0]);

        return {
          ...paper,
          studyMetadata: metadata
        };
      } catch (error) {
        console.warn(`Could not extract metadata for "${paper.title}":`, error.message);
        return {
          ...paper,
          studyMetadata: null
        };
      }
    });

    const enrichedPapers = await Promise.all(metadataPromises);
    console.timeEnd('Metadata Extraction');

    return enrichedPapers;
  } catch (error) {
    console.error('Metadata extraction error:', error);
    return papers; // Return papers without metadata if extraction fails
  }
}

function calculateTruthScore(pubmedResults, claim) {
  let truthScore = 50; // Start at neutral
  let researchBreakdown = { positive: 0, negative: 0, neutral: 0 };

  // Simple quality-weighted research score based on paper sentiments
  if (pubmedResults.papers && pubmedResults.papers.length > 0) {
    const papersWithSentiment = pubmedResults.papers.filter(p => p.paperSentiment);

    if (papersWithSentiment.length > 0) {
      // Calculate total quality weight
      const totalQualityWeight = papersWithSentiment.reduce((sum, paper) => {
        return sum + (paper.qualityScore || 0.5);
      }, 0);

      // Calculate weighted sentiment percentages
      let weightedPositive = 0;
      let weightedNegative = 0;
      let weightedNeutral = 0;

      papersWithSentiment.forEach(paper => {
        const weight = (paper.qualityScore || 0.5) / totalQualityWeight;
        const confidence = paper.paperSentiment.confidence || 0.5;

        if (paper.paperSentiment.sentiment === 'POSITIVE') {
          weightedPositive += weight * confidence;
        } else if (paper.paperSentiment.sentiment === 'NEGATIVE') {
          weightedNegative += weight * confidence;
        } else {
          weightedNeutral += weight * confidence;
        }
      });

      // Convert to percentages for display
      researchBreakdown = {
        positive: Math.round(weightedPositive * 100),
        negative: Math.round(weightedNegative * 100),
        neutral: Math.round(weightedNeutral * 100)
      };

      // SIMPLE TRUTH SCORE CALCULATION:
      // Truth Score = Support% - Contradict%
      // This means:
      // - 100% support, 0% contradict = 100% truth score
      // - 0% support, 100% contradict = -100% → 0% truth score
      // - 50% support, 30% contradict = 20% truth score
      // - Neutral papers don't affect the score

      const supportPercent = researchBreakdown.positive;
      const contradictPercent = researchBreakdown.negative;

      truthScore = supportPercent - contradictPercent;

      // Clamp between 0 and 100
      truthScore = Math.max(0, Math.min(100, truthScore));

      console.log(`📊 Research sentiment: ${researchBreakdown.positive}% support, ${researchBreakdown.negative}% contradict, ${researchBreakdown.neutral}% neutral`);
      console.log(`📈 Truth score: ${truthScore.toFixed(0)}% (${supportPercent}% - ${contradictPercent}%)`);
    } else {
      // Fallback: if papers found but no sentiment analysis
      truthScore = 50; // Neutral if we can't analyze
      console.log(`⚠️  No paper sentiment data, using neutral score: ${truthScore}%`);
    }
  }

  // Confidence based on number of papers analyzed
  let confidence = 50;
  if (pubmedResults.count >= 5) confidence = 90;
  else if (pubmedResults.count >= 3) confidence = 80;
  else if (pubmedResults.count >= 1) confidence = 60;

  return {
    truthScore: Math.round(truthScore),
    confidence: confidence,
    paperCount: pubmedResults.count,
    breakdown: {
      positive: researchBreakdown.positive,
      negative: researchBreakdown.negative,
      neutral: researchBreakdown.neutral
    }
  };
}

// ===== AI PROCESSING FUNCTIONS =====

async function summarizeAbstracts(abstracts) {
  if (abstracts.length === 0) return [];

  console.log(`Summarizing ${abstracts.length} abstracts via Chrome Summarizer API...`);

  try {
    const summarizer = await getSummarizerSession();

    // Parallelize all summarization calls
    const summaryPromises = abstracts.map(async (item) => {
      try {
        const summary = await summarizer.summarize(item.abstract);

        return {
          paperId: item.paperId,
          pmid: item.pmid,
          title: item.title,
          summary: summary
        };
      } catch (error) {
        console.error(`Error summarizing ${item.paperId || item.pmid}:`, error);
        // Fallback: use first 200 chars
        return {
          paperId: item.paperId,
          pmid: item.pmid,
          title: item.title,
          summary: item.abstract.substring(0, 200) + '...'
        };
      }
    });

    return await Promise.all(summaryPromises);
  } catch (error) {
    console.error('Chrome Summarizer API not available:', error);
    // Fallback: return truncated abstracts
    return abstracts.map(item => ({
      paperId: item.paperId,
      pmid: item.pmid,
      title: item.title,
      summary: item.abstract.substring(0, 200) + '...'
    }));
  }
}

// Analyze whether papers support or contradict the claim
async function analyzePapers(claim, papers) {
  if (papers.length === 0) return papers;

  try {
    console.log(`🔬 Analyzing ${papers.length} papers against claim...`);

    const session = await getLanguageModelSession();

    // Analyze papers in parallel
    const analysisPromises = papers.map(async (paper) => {
      const prompt = `Analyze if this research paper SUPPORTS, CONTRADICTS, or is NEUTRAL toward the health claim.

CLAIM: "${claim}"

PAPER TITLE: ${paper.title}
KEY FINDINGS: ${paper.summary || paper.abstract}

Return ONLY a JSON object with this exact format:
{
  "sentiment": "POSITIVE" | "NEGATIVE" | "NEUTRAL",
  "confidence": 0.0 to 1.0,
  "reason": "brief explanation (1 sentence)"
}

Where:
- POSITIVE = paper supports/confirms the claim
- NEGATIVE = paper contradicts/refutes the claim
- NEUTRAL = paper is inconclusive/unrelated

Return ONLY valid JSON, no other text.`;

      try {
        const response = await session.prompt(prompt);

        // Parse JSON response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }

        const sentiment = JSON.parse(jsonMatch[0]);

        return {
          ...paper,
          paperSentiment: sentiment
        };
      } catch (error) {
        console.warn(`Analysis failed for "${paper.title}":`, error.message);
        return {
          ...paper,
          paperSentiment: { sentiment: 'NEUTRAL', confidence: 0.5, reason: 'Analysis failed' }
        };
      }
    });

    const papersWithSentiment = await Promise.all(analysisPromises);

    console.log(`✅ Paper analysis complete`);
    papersWithSentiment.forEach((paper, idx) => {
      console.log(`  ${idx + 1}. ${paper.paperSentiment.sentiment} (${(paper.paperSentiment.confidence * 100).toFixed(0)}%) - ${paper.title.substring(0, 60)}...`);
    });

    return papersWithSentiment;
  } catch (error) {
    console.error('Error analyzing papers:', error);
    // Return papers without sentiment analysis (fallback)
    return papers;
  }
}

// REMOVED: simplifyText function - summaries are already concise from OpenAI

async function translateText(text, targetLanguage) {
  try {
    const translator = await getTranslatorSession(targetLanguage);
    const translation = await translator.translate(text);
    console.log(`✓ Translated to ${targetLanguage}`);
    return translation;
  } catch (error) {
    console.error(`Chrome Translator API not available for ${targetLanguage}:`, error);
    // Fallback: return original text
    return text;
  }
}

// REMOVED: makeAnalysisConcise function - OpenAI already provides concise output

// ===== PROMPT BUILDING =====

function buildFactCheckPrompt(claim, pubmedResults, simplified, truthScore) {
  const researchSummary = simplified.map((item, idx) =>
    `${idx + 1}. ${item.title}\n   Key findings: ${item.simplified}`
  ).join('\n\n');

  return `You are a medical fact-checker analyzing health claims using peer-reviewed scientific research.

CLAIM TO VERIFY:
"${claim}"

TRUTH SCORE: ${truthScore.truthScore}% (Confidence: ${truthScore.confidence}%)
- Based on ${truthScore.paperCount} peer-reviewed papers
- ${truthScore.breakdown.positive}% support, ${truthScore.breakdown.negative}% contradict, ${truthScore.breakdown.neutral}% neutral

SCIENTIFIC RESEARCH (${pubmedResults.count} papers analyzed):
${researchSummary}

TASK: Provide a CONCISE fact-check analysis:

1. WHAT THE RESEARCH SHOWS: Summarize the scientific consensus in 3-4 sentences. Be specific about what studies found.

2. BOTTOM LINE: Key takeaway in 1-2 sentences. What should people know?

3. CAVEATS: Any important limitations or nuances (1-2 sentences).

Keep response under 150 words total. Be objective and evidence-based.`;
}

// ===== UI FUNCTIONS =====

function formatMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^\* /gm, '• ')
    .replace(/^(\d+\.\s)/gm, '<strong>$1</strong>');
}

function showProgress(message) {
  const resultDiv = document.getElementById('results');
  resultDiv.innerHTML = `<p style="color: #667eea; font-weight: 600; padding: 15px; background: #f0f4ff; border-radius: 8px; text-align: center;">${message}</p>`;
  resultDiv.style.display = 'block';
}

function displayResults(analysis, pubmedResults, simplified, truthScore, language = 'en') {
  const resultDiv = document.getElementById('results');

  const langLabels = {
    'en': 'English',
    'es': 'Español',
    'ja': '日本語'
  };

  // Light colors for better visibility
  const scoreColor = truthScore.truthScore >= 70 ? '#86efac' :  // Light green
                      truthScore.truthScore >= 30 ? '#fde047' : // Yellow
                      '#fca5a5';  // Light red

  const scoreTextColor = truthScore.truthScore >= 70 ? '#166534' :  // Dark green text
                          truthScore.truthScore >= 30 ? '#854d0e' : // Dark yellow text
                          '#991b1b';  // Dark red text

  const scoreSection = `
    <div style="margin-top: 12px; padding: 12px; background: rgba(255,255,255,0.1); border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 14px; font-weight: 700;">Truth Score</span>
        <span style="font-size: 18px; font-weight: 800; color: ${scoreTextColor};">${truthScore.truthScore}%</span>
      </div>
      <div style="background: rgba(255,255,255,0.3); border-radius: 8px; height: 8px; overflow: hidden;">
        <div style="background: ${scoreColor}; height: 100%; width: ${truthScore.truthScore}%; transition: width 0.5s ease;"></div>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 10px; margin-top: 6px; opacity: 0.9;">
        <span>${truthScore.paperCount} Papers</span>
        <span>Confidence: ${truthScore.confidence}%</span>
      </div>
      <div style="font-size: 9px; margin-top: 4px; opacity: 0.8; text-align: center;">
        ${truthScore.breakdown.positive}% support • ${truthScore.breakdown.negative}% contradict • ${truthScore.breakdown.neutral}% neutral
      </div>
      <div style="font-size: 8px; margin-top: 3px; opacity: 0.7; text-align: center; font-style: italic;">
        Formula: ${truthScore.breakdown.positive}% - ${truthScore.breakdown.negative}% = ${truthScore.truthScore}%
      </div>
    </div>
  `;

  const aiBadges = `
    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px;">
      <span style="background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">PubMed + Semantic Scholar</span>
      ${language !== 'en' ? '<span style="background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">Translator</span>' : ''}
      <span style="background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">Chrome AI</span>
    </div>
  `;

  let sourcesHTML = '';
  if (pubmedResults.papers.length > 0) {
    sourcesHTML = `
      <div style="margin-top: 15px; padding: 12px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
        <div id="research-header" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
          <h4 style="margin: 0; color: #1f2937; font-size: 13px; font-weight: 700;">
            View Research Details (${pubmedResults.count} papers)
          </h4>
          <span id="research-toggle" style="color: #6b7280; font-size: 12px;">▼ Show</span>
        </div>
        <div id="research-details" style="display: none; margin-top: 12px;">
          ${pubmedResults.papers.map((paper, idx) => {
            const simplifiedText = simplified[idx]?.simplified || 'Abstract not available';
            const metadata = paper.studyMetadata;
            const sentiment = paper.paperSentiment;

            // Determine sentiment tag
            let sentimentTag = '';
            if (sentiment) {
              const isSignificant = metadata?.statistics?.significant === true;

              if (sentiment.sentiment === 'POSITIVE') {
                // Only show SUPPORTS if statistically significant (if we have that data)
                if (isSignificant || !metadata || metadata.statistics?.significant === undefined) {
                  sentimentTag = '<span style="display: inline-block; background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 700; margin-left: 6px;">SUPPORTS</span>';
                } else if (metadata.statistics?.significant === false) {
                  // Has data but not significant - show neutral
                  sentimentTag = '<span style="display: inline-block; background: #fef9c3; color: #854d0e; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 700; margin-left: 6px;">NEUTRAL (not significant)</span>';
                }
              } else if (sentiment.sentiment === 'NEGATIVE') {
                sentimentTag = '<span style="display: inline-block; background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 700; margin-left: 6px;">CONTRADICTS</span>';
              } else {
                sentimentTag = '<span style="display: inline-block; background: #fef9c3; color: #854d0e; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 700; margin-left: 6px;">NEUTRAL</span>';
              }
            }

            // Build metadata display if available
            let metadataHTML = '';
            if (metadata && metadata.sampleSize !== 'not reported') {
              const demo = metadata.demographics || {};
              const stats = metadata.statistics || {};

              metadataHTML = `
                <div style="background: #fef3c7; padding: 6px 8px; border-radius: 3px; font-size: 10px; color: #78350f; margin-top: 6px; line-height: 1.5;">
                  <strong>Study Details:</strong><br/>
                  ${metadata.studyType !== 'not reported' ? `<span style="display: inline-block; background: #fcd34d; padding: 1px 4px; border-radius: 2px; margin-right: 4px; font-size: 9px;">${metadata.studyType}</span>` : ''}
                  ${metadata.sampleSize !== 'not reported' ? `<strong>n=${metadata.sampleSize}</strong> • ` : ''}
                  ${demo.age !== 'not reported' ? `${demo.age} • ` : ''}
                  ${demo.gender !== 'not reported' ? `${demo.gender}` : ''}
                  ${demo.population !== 'not reported' ? `<br/><strong>Population:</strong> ${demo.population}` : ''}
                  ${stats.pValue !== 'not reported' || stats.effectSize !== 'not reported' ? '<br/>' : ''}
                  ${stats.pValue !== 'not reported' ? `<strong>p-value:</strong> ${stats.pValue} • ` : ''}
                  ${stats.effectSize !== 'not reported' ? `<strong>Effect:</strong> ${stats.effectSize}` : ''}
                  ${stats.significant === true ? ' <span style="color: #059669;">✓ Statistically significant</span>' : ''}
                  ${stats.significant === false ? ' <span style="color: #dc2626;">Not significant</span>' : ''}
                </div>
              `;
            }

            return `
            <div style="margin-bottom: 12px; padding: 10px; background: white; border-radius: 4px; border: 1px solid #e5e7eb;">
              <div style="font-weight: 600; color: #1f2937; font-size: 12px; margin-bottom: 4px; display: flex; align-items: center; flex-wrap: wrap;">
                <a href="${paper.url}" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: none; cursor: pointer;">
                  ${paper.title} ↗
                </a>
                ${sentimentTag}
              </div>
              <div style="font-size: 10px; color: #6b7280; margin-bottom: 6px;">
                ${paper.authors} • ${paper.journal} (${paper.year})
                ${paper.citations ? ` • <strong>${paper.citations} citations</strong>` : ''}
                ${paper.influentialCitations ? ` (${paper.influentialCitations} influential)` : ''}
              </div>
              <div style="background: #f0f9ff; padding: 8px; border-radius: 3px; font-size: 11px; color: #0c4a6e; line-height: 1.4;">
                <strong>Key Findings:</strong> ${simplifiedText}
              </div>
              ${metadataHTML}
            </div>
          `;
          }).join('')}
        </div>
      </div>
    `;
  }

  resultDiv.innerHTML = `
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
      <h3 style="margin: 0 0 5px 0; font-size: 16px;">
        Truth Dose
      </h3>
      <p style="margin: 0; font-size: 12px; opacity: 0.9;">
        AI analysis of ${pubmedResults.count} peer-reviewed papers${language !== 'en' ? ` • ${langLabels[language]}` : ''}
      </p>
      ${scoreSection}
      ${aiBadges}
    </div>

    <div style="background: #ffffff; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #e5e7eb;">
      <div style="white-space: pre-wrap; font-family: inherit; margin: 0;
                  line-height: 1.6; font-size: 13px; color: #1f2937;">${formatMarkdown(analysis)}</div>
    </div>

    ${sourcesHTML}
  `;

  resultDiv.style.display = 'block';

  setTimeout(() => {
    const researchHeader = document.getElementById('research-header');
    if (researchHeader) {
      researchHeader.addEventListener('click', () => toggleSection('research-details'));
    }
  }, 100);
}

window.toggleSection = function(sectionId) {
  const section = document.getElementById(sectionId);
  const toggle = document.getElementById(sectionId.replace('-details', '-toggle'));

  if (section.style.display === 'none') {
    section.style.display = 'block';
    toggle.textContent = '▲ Hide';
  } else {
    section.style.display = 'none';
    toggle.textContent = '▼ Show';
  }
}

// ===== MAIN CLICK HANDLER =====

async function onCheckClick() {
  const input = document.querySelector('#claimInput');
  const languageSelect = document.querySelector('#language');
  const language = languageSelect ? languageSelect.value : 'en';
  const resultDiv = document.querySelector('#results');
  const button = document.querySelector('#checkButton');
  const claim = (input?.value || '').trim();

  if (!claim) {
    alert('Please enter a health claim to check');
    return;
  }

  button.textContent = 'Researching...';
  button.disabled = true;
  resultDiv.style.display = 'none';

  // Start overall timing
  console.log('\n' + '='.repeat(80));
  console.log('⏱️  PERFORMANCE TIMING - START');
  console.log('='.repeat(80));
  const startTime = performance.now();

  try {
    // Step 1: Run Hybrid search (PubMed + Semantic Scholar)
    console.time('⏱️  Step 1: Hybrid Paper Search');
    showProgress('Searching PubMed + Semantic Scholar...');
    const pubmedResults = await searchHybrid(claim);
    console.timeEnd('⏱️  Step 1: Hybrid Paper Search');

    if (pubmedResults.count === 0) {
      console.log('No research papers found');
      resultDiv.innerHTML = '<p style="color: orange;"><strong>No Research Found:</strong> Could not find peer-reviewed papers for this claim. Try rephrasing your query.</p>';
      resultDiv.style.display = 'block';
      return;
    }

    // Step 2: Fetch abstracts
    console.time('⏱️  Step 2: Fetch Abstracts');
    showProgress('Fetching research abstracts...');
    const abstracts = await fetchAbstracts(pubmedResults.papers);
    console.timeEnd('⏱️  Step 2: Fetch Abstracts');

    // Step 3: Summarize abstracts
    console.time('⏱️  Step 3: Summarize Abstracts');
    showProgress('Summarizing research findings...');
    const summaries = await summarizeAbstracts(abstracts);
    console.timeEnd('⏱️  Step 3: Summarize Abstracts');

    // Merge summaries back into papers
    const papersWithSummaries = pubmedResults.papers.map(paper => {
      const summary = summaries.find(s => s.title === paper.title);
      return {
        ...paper,
        summary: summary?.summary || paper.abstract?.substring(0, 200) || 'No summary available'
      };
    });

    // Step 4: Analyze paper conclusions against claim
    console.time('⏱️  Step 4: Analyze Paper Conclusions');
    showProgress('Analyzing research conclusions...');
    const papersWithAnalysis = await analyzePapers(claim, papersWithSummaries);
    console.timeEnd('⏱️  Step 4: Analyze Paper Conclusions');

    // Update pubmedResults with analyzed papers
    pubmedResults.papers = papersWithAnalysis;

    // Use summaries directly (no simplification needed with OpenAI)
    const simplified = summaries.map(s => ({ ...s, simplified: s.summary }));

    // Step 5: Calculate Truth Score (based on paper analysis!)
    console.time('⏱️  Step 5: Calculate Truth Score');
    showProgress('Calculating Truth Score...');
    const truthScore = calculateTruthScore(pubmedResults, claim);
    console.timeEnd('⏱️  Step 5: Calculate Truth Score');

    // Step 6: Generate final analysis
    console.time('⏱️  Step 6: Generate Final Analysis');
    showProgress('Generating comprehensive fact-check...');

    const prompt = buildFactCheckPrompt(claim, pubmedResults, simplified, truthScore);

    const session = await getLanguageModelSession();
    const finalAnalysis = await session.prompt(prompt);
    console.timeEnd('⏱️  Step 6: Generate Final Analysis');

    // Translate if needed
    let translatedAnalysis = finalAnalysis;
    if (language !== 'en') {
      console.time('⏱️  Step 7: Translation');
      showProgress(`Translating to ${language === 'es' ? 'Spanish' : 'Japanese'}...`);
      translatedAnalysis = await translateText(finalAnalysis, language);
      console.timeEnd('⏱️  Step 7: Translation');
    }

    // Calculate total time
    const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log('='.repeat(80));
    console.log(`⏱️  TOTAL TIME: ${totalTime}s`);
    console.log('='.repeat(80) + '\n');

    // Display results
    displayResults(translatedAnalysis, pubmedResults, simplified, truthScore, language);

  } catch (error) {
    resultDiv.innerHTML = `<p style="color: red;"><strong>Error:</strong> ${error.message}</p>`;
    resultDiv.style.display = 'block';
    console.error('Full error:', error);
  } finally {
    button.textContent = 'How true is that?';
    button.disabled = false;
  }
}

// ===== INITIALIZATION =====

document.addEventListener('DOMContentLoaded', async () => {
  const btn = document.querySelector('#checkButton');
  if (btn) btn.addEventListener('click', onCheckClick);

  // Check Chrome AI availability and show warning if needed
  try {
    const availability = await checkChromeAIAvailability();
    if (!availability.languageModel || !availability.summarizer) {
      const resultDiv = document.querySelector('#results');
      if (resultDiv) {
        resultDiv.innerHTML = `
          <div style="background: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 12px; margin-bottom: 15px;">
            <h4 style="margin: 0 0 8px 0; color: #92400e; font-size: 14px;">⚠️ Chrome Built-in AI Not Available</h4>
            <p style="margin: 0; font-size: 12px; color: #78350f; line-height: 1.5;">
              TrueDose requires Chrome's Built-in AI APIs. Please:
            </p>
            <ol style="margin: 8px 0 0 0; padding-left: 20px; font-size: 11px; color: #78350f; line-height: 1.6;">
              <li>Use Chrome Canary or Dev channel (version 128+)</li>
              <li>Enable flags at <code>chrome://flags</code>:
                <ul style="margin: 4px 0; padding-left: 15px;">
                  <li><code>chrome://flags/#optimization-guide-on-device-model</code> → Enabled</li>
                  <li><code>chrome://flags/#prompt-api-for-gemini-nano</code> → Enabled</li>
                  <li><code>chrome://flags/#summarization-api-for-gemini-nano</code> → Enabled</li>
                  <li><code>chrome://flags/#translation-api</code> → Enabled</li>
                </ul>
              </li>
              <li>Restart Chrome</li>
              <li>Wait for model download (check DevTools console)</li>
            </ol>
          </div>
        `;
        resultDiv.style.display = 'block';
      }
      console.warn('Chrome AI not fully available:', availability);
    } else {
      console.log('✓ Chrome AI is available and ready');
    }
  } catch (error) {
    console.error('Error checking Chrome AI availability:', error);
  }

  // Check if there's selected text from context menu and optionally auto-run
  chrome.storage.local.get(['selectedText', 'runSearchOnOpen'], (result) => {
    const { selectedText, runSearchOnOpen } = result || {};
    if (selectedText) {
      const input = document.querySelector('#claimInput');
      if (input) input.value = selectedText;
      // Clear the one-time values
      chrome.storage.local.remove(['selectedText', 'runSearchOnOpen']);
      // If requested, auto-run the search as soon as the popup is ready
      if (runSearchOnOpen && btn) {
        // Defer to next tick so layout is ready
        setTimeout(() => btn.click(), 0);
      }
    }
  });
});

// Prevent popup from closing when clicking external links
document.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (link && link.href && link.href.startsWith('http')) {
    event.preventDefault();
    chrome.tabs.create({ url: link.href });
  }
});

