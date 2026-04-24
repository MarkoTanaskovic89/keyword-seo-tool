module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const GOOGLE_KEY = process.env.GOOGLE_SEARCH_API_KEY;
  const SEARCH_ENGINE_ID = '022a643942c6e431d';
  const MOZ_TOKEN = process.env.MOZ_API_TOKEN;

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) {} }
  const { keyword, your_domain } = body || {};

  if (!keyword) return res.status(400).json({ error: 'Keyword required' });

  try {
    // Step 1: Google Custom Search - get top 10
    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(keyword)}&num=10`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.error) return res.status(400).json({ error: searchData.error.message });

    const items = searchData.items || [];
    if (!items.length) return res.status(200).json({ results: [] });

    // Step 2: Get DA for all domains via Moz
    const domains = items.map(item => {
      try { return new URL(item.link).hostname.replace('www.', ''); } catch(e) { return item.link; }
    });

    let mozData = {};
    try {
      const mozRes = await fetch('https://lsapi.seomoz.com/v2/url_metrics', {
        method: 'POST',
        headers: { 'x-moz-token': MOZ_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targets: domains,
          select: ['domain_authority', 'page_authority', 'spam_score', 'root_domains_to_root_domain']
        })
      });
      const mozJson = await mozRes.json();
      (mozJson.results || []).forEach((r, i) => {
        mozData[domains[i]] = r;
      });
    } catch(e) {
      console.log('Moz error:', e.message);
    }

    // Step 3: Fetch each page for meta title, description, word count
    const pageData = await Promise.all(items.map(async (item) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const pageRes = await fetch(item.link, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MaximusBot/1.0)' }
        });
        clearTimeout(timeout);
        const html = await pageRes.text();

        // Extract meta title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const metaTitle = titleMatch ? titleMatch[1].trim() : item.title;

        // Extract meta description
        const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
        const metaDesc = descMatch ? descMatch[1].trim() : '';

        // Count words (rough estimate from body text)
        const bodyText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        const wordCount = bodyText.split(' ').filter(w => w.length > 2).length;

        // Count H2 tags
        const h2Count = (html.match(/<h2/gi) || []).length;
        const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        const h1 = h1Match ? h1Match[1].trim() : '';

        // Check schema
        const hasSchema = html.includes('application/ld+json');

        return { metaTitle, metaDesc, wordCount: Math.min(wordCount, 10000), h2Count, h1, hasSchema };
      } catch(e) {
        return { metaTitle: item.title, metaDesc: '', wordCount: 0, h2Count: 0, h1: '', hasSchema: false };
      }
    }));

    // Step 4: Build results
    const results = items.map((item, i) => {
      const domain = domains[i];
      const moz = mozData[domain] || {};
      const page = pageData[i];
      const isYours = your_domain && domain.includes(your_domain.replace(/^www\./, ''));

      return {
        position: i + 1,
        url: item.link,
        domain,
        title: page.metaTitle || item.title,
        meta_description: page.metaDesc || item.snippet || '',
        word_count: page.wordCount,
        h2_count: page.h2Count,
        h1: page.h1,
        has_schema: page.hasSchema,
        domain_authority: moz.domain_authority || 0,
        page_authority: moz.page_authority || 0,
        linking_domains: moz.root_domains_to_root_domain || 0,
        spam_score: moz.spam_score || 0,
        is_yours: isYours
      };
    });

    // Step 5: Gap analysis via Claude AI
    let gapAnalysis = null;
    try {
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: `Analyze these top 10 Google results for keyword "${keyword}" and provide a content gap analysis.

Results:
${results.map(r => `#${r.position}: ${r.domain} | DA:${r.domain_authority} | Words:${r.word_count} | Title: ${r.title}`).join('\n')}

Respond ONLY with valid JSON:
{
  "avg_word_count": number,
  "avg_da": number,
  "content_gaps": ["specific topic not covered by top results", "another gap"],
  "to_beat": "one sentence on what it takes to outrank these results",
  "quick_wins": ["specific actionable tip 1", "tip 2", "tip 3"]
}`
          }]
        })
      });
      const aiData = await aiRes.json();
      gapAnalysis = JSON.parse(aiData.content[0].text.replace(/```json|```/g, '').trim());
    } catch(e) {
      console.log('AI error:', e.message);
    }

    return res.status(200).json({ keyword, results, gapAnalysis });

  } catch(error) {
    console.error('SERP error:', error);
    return res.status(500).json({ error: error.message });
  }
}
