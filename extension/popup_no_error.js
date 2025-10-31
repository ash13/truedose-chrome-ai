// Health Fact Checker with Full AI Pipeline
// PubMed → Abstracts → Summarizer → Rewriter → Prompt API

// Cache for AI sessions to avoid recreating them
let cachedSessions = {
  languageModel: null,
  summarizer: null,
  rewriter: null,
  translator: null
};

document.getElementById('checkBtn').addEventListener('click', async () => {
  const claim = document.getElementById('claim').value.trim();
  const languageSelect = document.getElementById('language');
  const language = languageSelect ? languageSelect.value : 'en'; // Default to English if not found
  const resultDiv = document.getElementById('result');
  const button = document.getElementById('checkBtn');
  
  if (!claim) {
    alert('Please enter a health claim to check');
    return;
  }
  
  button.textContent = 'Researching...';
  button.disabled = true;
  resultDiv.style.display = 'none';
  
  try {
    // Check if Chrome AI is available
    if (typeof LanguageModel === 'undefined') {
      throw new Error('Chrome AI not available. Please enable it in chrome://flags');
    }
    
    // Step 1: Run PubMed search and Reddit discovery in parallel
    showProgress('🔍 Searching research papers and discovering communities...');
    const [pubmedResults, redditCommunities] = await Promise.all([
      searchPubMed(claim),
      discoverRelevantSubreddits(claim)
    ]);
    
    if (pubmedResults.count === 0) {
      showProgress('⚠️ No papers found. Gathering community insights...');

      // Still run Reddit analysis even without papers
      const redditData = await fetchRedditData(claim, redditCommunities);

      // Analyze community sentiment
      showProgress('📊 Analyzing community sentiment...');
      const communitySentiment = await analyzeCommunitySentiment(redditData, claim);

      // Calculate probability based on community data only
      showProgress('🎯 Calculating probability score...');
      const probabilityScore = calculateProbabilityScore(pubmedResults, communitySentiment, claim);

      // Generate analysis with community data
      showProgress('🤖 Generating comprehensive fact-check...');
      const session = await LanguageModel.create({
        systemPrompt: "You are a medical fact-checker.",
        outputLanguage: "en"
      });

      const prompt = buildFactCheckPrompt(claim, pubmedResults, [], communitySentiment, probabilityScore);
      const analysis = await session.prompt(prompt);

      // Make concise
      const conciseAnalysis = await makeAnalysisConcise(analysis);

      // Translate if needed
      let finalAnalysis = conciseAnalysis;
      if (language !== 'en') {
        showProgress(`🌍 Translating to ${language === 'es' ? 'Spanish' : 'Japanese'}...`);
        finalAnalysis = await translateText(conciseAnalysis, language);
      }

      displayResults(finalAnalysis, pubmedResults, [], redditData, communitySentiment, probabilityScore, language);
      return;
    }
    
    // Step 2: Fetch abstracts and Reddit data in parallel
    showProgress('📄 Fetching research abstracts and community discussions...');
    const [abstracts, redditData] = await Promise.all([
      fetchAbstracts(pubmedResults.papers),
      fetchRedditData(claim, redditCommunities)
    ]);
    
    // Step 3: Process research and community data in parallel
    showProgress('📝 Processing research findings and analyzing community sentiment...');
    const [summaries, communitySentiment] = await Promise.all([
      summarizeAbstracts(abstracts),
      analyzeCommunitySentiment(redditData, claim)
    ]);

    // Step 4: Simplify language (faster, single step)
    showProgress('✍️ Finalizing analysis...');
    const simplified = await simplifyText(summaries);

    // Step 5: Calculate probabilistic score
    showProgress('🎯 Calculating probability score...');
    const probabilityScore = calculateProbabilityScore(pubmedResults, communitySentiment, claim);

    // Step 5: Generate final analysis (streamlined)
    showProgress('🤖 Generating comprehensive fact-check...');

    // Use cached language model session
    if (!cachedSessions.languageModel) {
      cachedSessions.languageModel = await LanguageModel.create({
        systemPrompt: "You are a medical fact-checker. Provide concise, clear analysis.",
        outputLanguage: "en"
      });
    }

    const prompt = buildFactCheckPrompt(claim, pubmedResults, simplified, communitySentiment, probabilityScore);
    let finalAnalysis = await cachedSessions.languageModel.prompt(prompt);

    // Translate if needed
    if (language !== 'en') {
      showProgress(`🌍 Translating to ${language === 'es' ? 'Spanish' : 'Japanese'}...`);
      finalAnalysis = await translateText(finalAnalysis, language);
    }
    
    // Display results
    displayResults(finalAnalysis, pubmedResults, simplified, redditData, communitySentiment, probabilityScore, language);
    
  } catch (error) {
    resultDiv.innerHTML = `<p style="color: red;"><strong>Error:</strong> ${error.message}</p>`;
    resultDiv.style.display = 'block';
    console.error('Full error:', error);
  } finally {
    button.textContent = 'Check This Claim';
    button.disabled = false;
  }
});

// ===== PUBMED FUNCTIONS =====

async function searchPubMed(query) {
  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=5&retmode=json&sort=relevance`;
    
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    const pmids = searchData.esearchresult.idlist;
    
    if (pmids.length === 0) {
      return { papers: [], count: 0 };
    }
    
    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json`;
    const summaryResponse = await fetch(summaryUrl);
    const summaryData = await summaryResponse.json();
    
    const papers = pmids.map(id => {
      const paper = summaryData.result[id];
      return {
        title: paper.title,
        authors: paper.authors?.slice(0, 3).map(a => a.name).join(', ') || 'Unknown',
        journal: paper.fulljournalname || paper.source,
        year: paper.pubdate?.split(' ')[0] || 'Unknown',
        pmid: id,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`
      };
    });
    
    return { papers, count: papers.length };
    
  } catch (error) {
    console.error('PubMed error:', error);
    return { papers: [], count: 0, error: error.message };
  }
}

async function fetchAbstracts(papers) {
  const abstracts = [];
  
  for (const paper of papers) {
    try {
      const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${paper.pmid}&retmode=xml`;
      const response = await fetch(fetchUrl);
      const xmlText = await response.text();
      
      // Extract abstract using regex
      const abstractMatch = xmlText.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g);
      
      if (abstractMatch) {
        const abstractParts = abstractMatch.map(tag => tag.replace(/<[^>]+>/g, '').trim());
        const fullAbstract = abstractParts.join(' ');
        
        abstracts.push({
          pmid: paper.pmid,
          title: paper.title,
          abstract: fullAbstract
        });
      }
    } catch (error) {
      console.error(`Error fetching abstract for ${paper.pmid}:`, error);
    }
  }
  
  return abstracts;
}

// ===== REDDIT FUNCTIONS =====

async function discoverRelevantSubreddits(claim) {
  try {
    // Step 1: Extract health keywords using Chrome AI
    const session = await LanguageModel.create({
      systemPrompt: "Extract health-related keywords and medical terms from text. Return only the most important 3-5 keywords separated by commas.",
      outputLanguage: "en"
    });

    const keywords = await session.prompt(`Extract health keywords from: "${claim}"`);
    const keywordList = keywords.split(',').map(k => k.trim().toLowerCase()).slice(0, 3); // Limit to 3 keywords

    // Step 2: Search for relevant subreddits
    const relevantSubs = new Set();

    // Add condition-specific subreddits
    for (const keyword of keywordList) {
      try {
        const searchUrl = `https://www.reddit.com/subreddits/search.json?q=${encodeURIComponent(keyword)}&limit=10`;
        const response = await fetch(searchUrl);
        const data = await response.json();

        if (data.data && data.data.children) {
          data.data.children.forEach(sub => {
            const subData = sub.data;
            if (subData.subscribers > 1000 && !subData.over18) { // Filter active, non-NSFW subs
              relevantSubs.add({
                name: subData.display_name,
                subscribers: subData.subscribers,
                description: subData.public_description || subData.title,
                relevance: calculateSubredditRelevance(subData.display_name, keywordList)
              });
            }
          });
        }
      } catch (error) {
        console.error(`Error searching for ${keyword}:`, error);
      }
    }

    // Step 3: Add general health subreddits
    const generalHealthSubs = ['AskDocs', 'medical', 'HealthAnxiety', 'Health', 'nutrition', 'supplements'];
    for (const subName of generalHealthSubs) {
      relevantSubs.add({
        name: subName,
        subscribers: 100000, // Default high value for established health subs
        description: 'General health community',
        relevance: 0.5
      });
    }

    // Step 4: Sort by relevance and subscriber count
    const sortedSubs = Array.from(relevantSubs)
      .sort((a, b) => (b.relevance * Math.log(b.subscribers)) - (a.relevance * Math.log(a.subscribers)))
      .slice(0, 5); // Limit to top 5 subreddits

    return sortedSubs;

  } catch (error) {
    console.error('Error discovering subreddits:', error);
    // Fallback to general health subreddits
    return [
      { name: 'AskDocs', subscribers: 100000, description: 'Ask medical professionals', relevance: 1.0 },
      { name: 'medical', subscribers: 50000, description: 'Medical discussions', relevance: 0.8 },
      { name: 'Health', subscribers: 200000, description: 'General health topics', relevance: 0.6 }
    ];
  }
}

function calculateSubredditRelevance(subName, keywords) {
  let relevance = 0;
  const subNameLower = subName.toLowerCase();

  for (const keyword of keywords) {
    if (subNameLower.includes(keyword)) {
      relevance += 1.0;
    } else if (subNameLower.includes(keyword.substring(0, 4))) {
      relevance += 0.5;
    }
  }

  // Boost medical/health related subreddits
  if (subNameLower.includes('medical') || subNameLower.includes('health') ||
      subNameLower.includes('doc') || subNameLower.includes('medicine')) {
    relevance += 0.3;
  }

  return Math.min(relevance, 1.0);
}

async function fetchRedditData(claim, subreddits) {
  const redditPosts = [];
  const searchTerms = extractSearchTerms(claim);

  for (const subreddit of subreddits) {
    try {
      // Search within each subreddit
      const searchUrl = `https://www.reddit.com/r/${subreddit.name}/search.json?q=${encodeURIComponent(searchTerms)}&restrict_sr=1&sort=relevance&limit=3`;
      const response = await fetch(searchUrl);
      const data = await response.json();

      if (data.data && data.data.children) {
        data.data.children.forEach(post => {
          const postData = post.data;
          redditPosts.push({
            subreddit: subreddit.name,
            title: postData.title,
            selftext: postData.selftext,
            score: postData.score,
            num_comments: postData.num_comments,
            created_utc: postData.created_utc,
            url: `https://www.reddit.com${postData.permalink}`,
            relevance_score: calculatePostRelevance(postData, claim)
          });
        });
      }
    } catch (error) {
      console.error(`Error fetching from r/${subreddit.name}:`, error);
    }
  }

  // Sort by relevance and score
  return redditPosts
    .sort((a, b) => (b.relevance_score * Math.log(b.score + 1)) - (a.relevance_score * Math.log(a.score + 1)))
    .slice(0, 8); // Top 8 most relevant posts
}

function extractSearchTerms(claim) {
  // Simple extraction - could be enhanced with AI
  return claim.split(' ')
    .filter(word => word.length > 3)
    .slice(0, 3)
    .join(' ');
}

function calculatePostRelevance(postData, claim) {
  const title = postData.title.toLowerCase();
  const text = postData.selftext.toLowerCase();
  const claimLower = claim.toLowerCase();

  let relevance = 0;
  const claimWords = claimLower.split(' ').filter(word => word.length > 3);

  for (const word of claimWords) {
    if (title.includes(word)) relevance += 2;
    if (text.includes(word)) relevance += 1;
  }

  // Normalize by length
  return relevance / claimWords.length;
}

async function analyzeCommunitySentiment(redditPosts, claim) {
  if (redditPosts.length === 0) {
    return {
      positive: 0,
      negative: 0,
      neutral: 0,
      confidence: 0,
      sample_size: 0,
      experiences: []
    };
  }

  try {
    // Use Chrome AI to analyze sentiment of Reddit posts
    const session = await LanguageModel.create({
      systemPrompt: `Analyze the sentiment of health-related Reddit posts about a claim.
      For each post, determine if the community experience is:
      POSITIVE - supports/confirms the claim
      NEGATIVE - contradicts/refutes the claim
      NEUTRAL - mixed or unclear evidence

      Return JSON format: {"sentiment": "POSITIVE|NEGATIVE|NEUTRAL", "confidence": 0.0-1.0, "key_points": ["point1", "point2"]}`,
      outputLanguage: "en"
    });

    const sentimentResults = [];
    let positive = 0, negative = 0, neutral = 0;

    for (const post of redditPosts.slice(0, 5)) { // Limit to 5 posts for performance
      try {
        const postText = `Title: ${post.title}\nContent: ${post.selftext.substring(0, 500)}`;
        const result = await session.prompt(`Analyze sentiment for claim "${claim}":\n${postText}`);

        // Try to parse JSON response
        let sentimentData;
        try {
          sentimentData = JSON.parse(result);
        } catch {
          // Fallback parsing if JSON fails
          if (result.toLowerCase().includes('positive')) sentimentData = { sentiment: 'POSITIVE', confidence: 0.6 };
          else if (result.toLowerCase().includes('negative')) sentimentData = { sentiment: 'NEGATIVE', confidence: 0.6 };
          else sentimentData = { sentiment: 'NEUTRAL', confidence: 0.5 };
        }

        sentimentResults.push({
          ...sentimentData,
          post_title: post.title,
          subreddit: post.subreddit,
          score: post.score
        });

        // Count sentiments
        switch (sentimentData.sentiment) {
          case 'POSITIVE': positive++; break;
          case 'NEGATIVE': negative++; break;
          default: neutral++; break;
        }

      } catch (error) {
        console.error('Error analyzing post sentiment:', error);
        neutral++; // Default to neutral on error
      }
    }

    const total = positive + negative + neutral;
    const confidence = total > 0 ? Math.min(total / 5, 1.0) : 0;

    return {
      positive: positive / total,
      negative: negative / total,
      neutral: neutral / total,
      confidence: confidence,
      sample_size: total,
      experiences: sentimentResults,
      raw_posts: redditPosts.length
    };

  } catch (error) {
    console.error('Error analyzing community sentiment:', error);
    return {
      positive: 0,
      negative: 0,
      neutral: 1,
      confidence: 0,
      sample_size: 0,
      experiences: []
    };
  }
}

function calculateProbabilityScore(pubmedResults, communitySentiment, claim) {
  // Weights: Research papers (70%), Community sentiment (30%)
  const RESEARCH_WEIGHT = 0.7;
  const COMMUNITY_WEIGHT = 0.3;

  // Calculate research score based on paper quality and consensus
  let researchScore = 0.5; // Default neutral
  if (pubmedResults.count > 0) {
    // More papers = higher confidence
    const paperConfidence = Math.min(pubmedResults.count / 5, 1.0);

    // Assume positive evidence if papers were found (simplified)
    // In a real system, this would analyze abstracts for supporting/contradicting evidence
    researchScore = 0.6 + (paperConfidence * 0.3); // 0.6-0.9 range
  }

  // Calculate community score
  let communityScore = 0.5; // Default neutral
  if (communitySentiment.sample_size > 0) {
    // Weight positive/negative experiences
    if (communitySentiment.positive > communitySentiment.negative) {
      communityScore = 0.3 + (communitySentiment.positive * 0.5); // 0.3-0.8 range
    } else if (communitySentiment.negative > communitySentiment.positive) {
      communityScore = 0.5 - (communitySentiment.negative * 0.3); // 0.2-0.5 range
    }

    // Apply confidence multiplier
    communityScore *= communitySentiment.confidence;
  }

  // Combine scores
  const finalScore = (researchScore * RESEARCH_WEIGHT) + (communityScore * COMMUNITY_WEIGHT);

  // Calculate confidence based on data availability
  let confidence = 0.5;
  if (pubmedResults.count > 0) confidence += 0.3;
  if (communitySentiment.sample_size > 3) confidence += 0.2;
  confidence = Math.min(confidence, 1.0);

  return {
    probability: Math.round(finalScore * 100), // Convert to percentage
    confidence: Math.round(confidence * 100),
    research_contribution: Math.round(researchScore * RESEARCH_WEIGHT * 100),
    community_contribution: Math.round(communityScore * COMMUNITY_WEIGHT * 100),
    research_papers: pubmedResults.count,
    community_posts: communitySentiment.sample_size,
    breakdown: {
      research_score: Math.round(researchScore * 100),
      community_score: Math.round(communityScore * 100),
      community_positive: Math.round(communitySentiment.positive * 100),
      community_negative: Math.round(communitySentiment.negative * 100),
      community_neutral: Math.round(communitySentiment.neutral * 100)
    }
  };
}

// ===== AI PROCESSING FUNCTIONS =====

async function summarizeAbstracts(abstracts) {
  if (abstracts.length === 0) return [];
  
  // Check if Summarizer is available
  if (typeof Summarizer === 'undefined') {
    console.warn('Summarizer not available, using original abstracts');
    return abstracts;
  }

  // Use cached summarizer or create new one
  if (!cachedSessions.summarizer) {
    cachedSessions.summarizer = await Summarizer.create({
      outputLanguage: "en"
    });
  }
  const summarizer = cachedSessions.summarizer;
  const summaries = [];
  
  for (const item of abstracts) {
    try {
      const summary = await summarizer.summarize(item.abstract);
      summaries.push({
        pmid: item.pmid,
        title: item.title,
        summary: summary
      });
    } catch (error) {
      console.error(`Error summarizing ${item.pmid}:`, error);
      // Fallback to first 200 chars if summarization fails
      summaries.push({
        pmid: item.pmid,
        title: item.title,
        summary: item.abstract.substring(0, 200) + '...'
      });
    }
  }
  
  return summaries;
}

async function simplifyText(summaries) {
  if (summaries.length === 0) return [];
  
  // Check if Rewriter is available
  if (typeof Rewriter === 'undefined') {
    console.warn('Rewriter not available, using summaries as-is');
    return summaries;
  }

  // Use cached rewriter or create new one
  if (!cachedSessions.rewriter) {
    cachedSessions.rewriter = await Rewriter.create({
      outputLanguage: "en"
    });
  }
  const rewriter = cachedSessions.rewriter;
  const simplified = [];
  
  for (const item of summaries) {
    try {
      const simple = await rewriter.rewrite(item.summary, {
        tone: "casual",
        length: "as-is"
      });
      
      simplified.push({
        pmid: item.pmid,
        title: item.title,
        simplified: simple
      });
    } catch (error) {
      console.error(`Error rewriting ${item.pmid}:`, error);
      // Fallback to summary if rewriting fails
      simplified.push({
        pmid: item.pmid,
        title: item.title,
        simplified: item.summary
      });
    }
  }
  
  return simplified;
}

async function translateText(text, targetLanguage) {
  // Check if Translator is available
  if (typeof Translator === 'undefined') {
    console.warn('Translator not available');
    return text;
  }
  
  try {
    const translator = await Translator.create({
      sourceLanguage: "en",
      targetLanguage: targetLanguage
    });
    
    const translated = await translator.translate(text);
    return translated;
  } catch (error) {
    console.error('Translation error:', error);
    return text; // Return original if translation fails
  }
}

async function makeAnalysisConcise(analysis) {
  try {
    // Step 1: Summarize to make it shorter
    if (typeof Summarizer !== 'undefined') {
      const summarizer = await Summarizer.create({
        outputLanguage: "en"
      });
      const summarized = await summarizer.summarize(analysis);
      
      // Step 2: Rewrite to make it more readable
      if (typeof Rewriter !== 'undefined') {
        const rewriter = await Rewriter.create({
          outputLanguage: "en"
        });
        const rewritten = await rewriter.rewrite(summarized, {
          tone: "casual",
          length: "shorter"
        });
        return rewritten;
      }
      
      return summarized;
    }
    
    return analysis; // Return original if APIs not available
  } catch (error) {
    console.error('Error making analysis concise:', error);
    return analysis;
  }
}

// ===== PROMPT BUILDING =====

function buildFactCheckPrompt(claim, pubmedResults, simplified, communitySentiment, probabilityScore) {
  const researchSummary = simplified.map((item, idx) =>
    `${idx + 1}. ${item.title}\n   Key findings: ${item.simplified}`
  ).join('\n\n');

  const communityInsights = communitySentiment.experiences.slice(0, 5).map((exp, idx) =>
    `${idx + 1}. r/${exp.subreddit}: ${exp.post_title} (${exp.sentiment.toLowerCase()})`
  ).join('\n');

  return `You are a medical fact-checker analyzing health claims using scientific research AND community experiences.

CLAIM TO VERIFY:
"${claim}"

CALCULATED PROBABILITY: ${probabilityScore.probability}% (Confidence: ${probabilityScore.confidence}%)
- Research Evidence: ${probabilityScore.research_contribution}%
- Community Experience: ${probabilityScore.community_contribution}%

SCIENTIFIC RESEARCH (${pubmedResults.count} papers analyzed):
${researchSummary}

COMMUNITY SENTIMENT (${communitySentiment.sample_size} posts analyzed):
- Positive experiences: ${Math.round(communitySentiment.positive * 100)}%
- Negative experiences: ${Math.round(communitySentiment.negative * 100)}%
- Neutral/Mixed: ${Math.round(communitySentiment.neutral * 100)}%

TOP COMMUNITY INSIGHTS:
${communityInsights}

TASK: Provide a CONCISE fact-check. Keep each section brief:

1. VERDICT: Choose ONE:
   ✅ TRUE - Strong scientific evidence supports this
   ⚠️ PARTIALLY TRUE - Some truth but important caveats
   ❓ INSUFFICIENT EVIDENCE - Not enough research
   ⚠️ MISLEADING - Contains truth but misrepresents facts
   ❌ FALSE - Scientific evidence contradicts this

2. SCIENTIFIC CONSENSUS: What do studies show? (2-3 sentences max)

3. COMMUNITY CONSENSUS: What do real users report? (2-3 sentences max)

4. BOTTOM LINE: Key takeaway in 1 sentence

Keep response under 150 words total.`;
}

// ===== UI FUNCTIONS =====

function formatMarkdown(text) {
  return text
    // Bold text: **text** -> <strong>text</strong>
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic text: *text* -> <em>text</em>
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Bullet points: * item -> • item with proper spacing
    .replace(/^\* /gm, '• ')
    // Numbered lists: keep as is but ensure proper spacing
    .replace(/^(\d+\.\s)/gm, '<strong>$1</strong>')
    // Checkmarks and emojis: preserve as-is
    .replace(/^(✅|❌|⚠️|❓)/gm, '<strong>$1</strong>');
}

function showProgress(message) {
  const resultDiv = document.getElementById('result');
  resultDiv.innerHTML = `<p style="color: #667eea; font-weight: 600; padding: 15px; background: #f0f4ff; border-radius: 8px; text-align: center;">${message}</p>`;
  resultDiv.style.display = 'block';
}

function displayResults(analysis, pubmedResults, simplified, redditData, communitySentiment, probabilityScore, language = 'en') {
  const resultDiv = document.getElementById('result');
  
  // Language labels
  const langLabels = {
    'en': 'English',
    'es': 'Español', 
    'ja': '日本語'
  };
  
  // Determine verdict styling
  let verdictColor = '#6b7280';
  let verdictEmoji = '❓';
  
  if (analysis.includes('✅ TRUE') || analysis.includes('✅ VERDADERO') || analysis.includes('✅ 本当')) {
    verdictColor = '#059669';
    verdictEmoji = '✅';
  } else if (analysis.includes('❌ FALSE') || analysis.includes('❌ FALSO') || analysis.includes('❌ 間違い')) {
    verdictColor = '#dc2626';
    verdictEmoji = '❌';
  } else if (analysis.includes('⚠️')) {
    verdictColor = '#d97706';
    verdictEmoji = '⚠️';
  }
  
  // Build probability visualization
  const probabilityColor = probabilityScore.probability >= 70 ? '#059669' :
                           probabilityScore.probability >= 30 ? '#d97706' : '#dc2626';

  const probabilitySection = `
    <div style="margin-top: 12px; padding: 12px; background: rgba(255,255,255,0.1); border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 14px; font-weight: 700;">Probability Score</span>
        <span style="font-size: 18px; font-weight: 800; color: ${probabilityColor};">${probabilityScore.probability}%</span>
      </div>
      <div style="background: rgba(255,255,255,0.2); border-radius: 8px; height: 6px; overflow: hidden;">
        <div style="background: ${probabilityColor}; height: 100%; width: ${probabilityScore.probability}%; transition: width 0.5s ease;"></div>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 10px; margin-top: 6px; opacity: 0.9;">
        <span>Research Weight: ${probabilityScore.research_contribution}%</span>
        <span>Community Weight: ${probabilityScore.community_contribution}%</span>
        <span>Confidence: ${probabilityScore.confidence}%</span>
      </div>
      <div style="font-size: 9px; margin-top: 4px; opacity: 0.8; text-align: center;">
        Community Sentiment: ${Math.round(communitySentiment.positive * 100)}% positive • ${Math.round(communitySentiment.negative * 100)}% negative
      </div>
    </div>
  `;

  // Build AI processing badges
  const aiBadges = `
    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px;">
      ${pubmedResults.count > 0 ? '<span style="background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">📚 PubMed</span>' : ''}
      ${language !== 'en' ? '<span style="background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🌍 Translator</span>' : ''}
      <span style="background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🤖 AI Analysis</span>
    </div>
  `;
  
  // Build expandable research papers section
  let sourcesHTML = '';
  if (pubmedResults.papers.length > 0) {
    sourcesHTML = `
      <div style="margin-top: 15px; padding: 12px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
        <div id="research-header" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
          <h4 style="margin: 0; color: #1f2937; font-size: 13px; font-weight: 700;">
            📚 View Research Details (${pubmedResults.count} papers)
          </h4>
          <span id="research-toggle" style="color: #6b7280; font-size: 12px;">▼ Show</span>
        </div>
        <div id="research-details" style="display: none; margin-top: 12px;">
          ${pubmedResults.papers.map((paper, idx) => {
            const simplifiedText = simplified[idx]?.simplified || 'Abstract not available';
            return `
            <div style="margin-bottom: 12px; padding: 10px; background: white; border-radius: 4px; border: 1px solid #e5e7eb;">
              <div style="font-weight: 600; color: #1f2937; font-size: 12px; margin-bottom: 4px;">
                <a href="#" onclick="openLink('${paper.url}'); return false;" style="color: #3b82f6; text-decoration: none; cursor: pointer;">
                  ${paper.title} ↗
                </a>
              </div>
              <div style="font-size: 10px; color: #6b7280; margin-bottom: 6px;">
                ${paper.authors} • ${paper.journal} (${paper.year})
              </div>
              <div style="background: #f0f9ff; padding: 8px; border-radius: 3px; font-size: 11px; color: #0c4a6e; line-height: 1.4;">
                <strong>Key Findings:</strong> ${simplifiedText}
              </div>
            </div>
          `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // Build Reddit community section
  let redditHTML = '';
  if (redditData.length > 0) {
    const topPosts = communitySentiment.experiences.slice(0, 4);
    redditHTML = `
      <div style="margin-top: 15px; padding: 12px; background: #fefbff; border-radius: 8px; border: 1px solid #e5e7eb;">
        <h4 style="margin: 0 0 10px 0; color: #1f2937; font-size: 13px; font-weight: 700;">
          💬 Community Experiences (${communitySentiment.sample_size} analyzed)
        </h4>
        <div style="display: flex; gap: 8px; margin-bottom: 10px; font-size: 11px;">
          <span style="background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 3px;">
            ✅ ${Math.round(communitySentiment.positive * 100)}% positive
          </span>
          <span style="background: #fef2f2; color: #991b1b; padding: 2px 6px; border-radius: 3px;">
            ❌ ${Math.round(communitySentiment.negative * 100)}% negative
          </span>
        </div>
        ${topPosts.map((post, idx) => {
          const redditPost = redditData.find(r => r.title === post.post_title);
          const postUrl = redditPost ? redditPost.url : '#';
          return `
          <div style="margin-bottom: 8px; padding: 8px; background: white; border-radius: 4px; border: 1px solid #e5e7eb;">
            <div style="font-size: 10px; color: #6b7280; margin-bottom: 3px;">
              r/${post.subreddit} • ${post.sentiment === 'POSITIVE' ? '✅' : post.sentiment === 'NEGATIVE' ? '❌' : '⚪'} ${post.sentiment.toLowerCase()}
            </div>
            <div style="font-size: 11px; color: #1f2937; font-weight: 500;">
              <a href="#" onclick="openLink('${postUrl}'); return false;" style="color: #3b82f6; text-decoration: none; cursor: pointer;">
                ${post.post_title} ↗
              </a>
            </div>
          </div>
        `;
        }).join('')}
      </div>
    `;
  }

  resultDiv.innerHTML = `
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
      <h3 style="margin: 0 0 5px 0; font-size: 16px; display: flex; align-items: center; gap: 8px;">
        ${verdictEmoji} Probabilistic Fact-Check
      </h3>
      <p style="margin: 0; font-size: 12px; opacity: 0.9;">
        AI analysis: ${pubmedResults.count} papers + ${communitySentiment.sample_size} community posts${language !== 'en' ? ` • ${langLabels[language]}` : ''}
      </p>
      ${probabilitySection}
      ${aiBadges}
    </div>
    
    <div style="background: #ffffff; padding: 15px; border-radius: 8px;
                border-left: 4px solid ${verdictColor}; margin-bottom: 15px;">
      <div style="white-space: pre-wrap; font-family: inherit; margin: 0;
                  line-height: 1.6; font-size: 13px; color: #1f2937;">${formatMarkdown(analysis)}</div>
    </div>

    ${sourcesHTML}

    ${redditHTML}
  `;

  resultDiv.style.display = 'block';

  // Add event listener for research section toggle
  setTimeout(() => {
    const researchHeader = document.getElementById('research-header');
    if (researchHeader) {
      researchHeader.addEventListener('click', () => toggleSection('research-details'));
    }
  }, 100);
}

// Make toggleSection globally accessible
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

// Function to open links without closing the popup
window.openLink = function(url) {
  chrome.tabs.create({ url: url });
}

// Load selected text from context menu
chrome.storage.local.get(['selectedText'], (result) => {
  if (result.selectedText) {
    document.getElementById('claim').value = result.selectedText;
    chrome.storage.local.remove('selectedText');
  }
});