module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) {} }
  const { target, competitor, domains } = body || {};

  if (!target) return res.status(400).json({ error: 'Target domain required' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Analyze this domain and create a specific link building outreach strategy.

Domain: ${target}
Competitor: ${competitor || 'not provided'}
Top referring domains: ${(domains||[]).slice(0,5).map(d=>d.domain).join(', ') || 'none yet'}

Based on the domain name and referring domains, determine the niche/industry.

Respond ONLY with valid JSON, no markdown, no backticks, no explanation:
{
  "niche": "one sentence - what this site does",
  "industry": "industry category (e.g. SEO tools, e-commerce, SaaS, fitness, etc)",
  "listicle_keywords": ["specific search query 1", "specific search query 2", "specific search query 3"],
  "outreach_targets": [
    {
      "type": "listicle",
      "title": "Target description",
      "why": "Why this is valuable",
      "email_subject": "Specific subject line",
      "email_body": "Hi [Name],\n\nI came across [specific context about their site].\n\n[Your pitch in one sentence].\n\nWould love to [specific ask].\n\nBest,\n[Your name]"
    }
  ],
  "quick_wins": ["specific action 1", "specific action 2", "specific action 3"]
}

Make outreach_targets array have exactly 4 items with types: listicle, blog, directory, press.
Make emails specific to the ${target} domain and its niche. Never use generic placeholders like "best [product category]".`
        }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });

    const text = data.content[0].text;
    try {
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      return res.status(200).json(parsed);
    } catch(e) {
      return res.status(500).json({ error: 'AI parse error: ' + text.slice(0, 100) });
    }

  } catch(error) {
    console.error('Outreach API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
