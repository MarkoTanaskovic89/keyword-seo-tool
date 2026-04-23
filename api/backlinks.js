module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const MOZ_TOKEN = process.env.MOZ_API_TOKEN;
  if (!MOZ_TOKEN) return res.status(500).json({ error: 'Moz API not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) {} }
  const { action, target, competitor } = body || {};

  const mozCall = async (endpoint, payload) => {
    const r = await fetch(`https://api.moz.com/v2/${endpoint}`, {
      method: 'POST',
      headers: {
        'x-moz-token': MOZ_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const text = await r.text();
    try { return JSON.parse(text); }
    catch(e) { throw new Error('Moz API error: ' + text.slice(0, 200)); }
  };

  try {
    // Get domain metrics (DA, backlinks, etc)
    if (action === 'summary') {
      const result = await mozCall('url/metrics', {
        url: target,
        select: ['domain_authority','page_authority','spam_score','linking_root_domains','inlinks_to_url','root_domains_to_root_domain','external_links']
      });
      if (result.error) return res.status(400).json({ error: result.error });
      return res.status(200).json({
        domain_authority: result.domain_authority || 0,
        page_authority: result.page_authority || 0,
        spam_score: result.spam_score || 0,
        linking_domains: result.linking_root_domains || result.root_domains_to_root_domain || 0,
        total_backlinks: result.external_links || result.inlinks_to_url || 0
      });
    }

    // Get linking domains
    if (action === 'referring_domains') {
      const result = await mozCall('links/root_domains', {
        target,
        scope: 'root_domain',
        limit: 100,
        select: ['domain_authority','source_domain','external_links_to_target']
      });
      if (result.error) return res.status(400).json({ error: result.error });
      const items = (result.results || []).map(d => ({
        domain: d.source_domain,
        domain_authority: d.domain_authority || 0,
        links_to_target: d.external_links_to_target || 0
      }));
      return res.status(200).json({ items });
    }

    // Get backlinks
    if (action === 'backlinks') {
      const result = await mozCall('links/pages', {
        target,
        scope: 'root_domain',
        limit: 100,
        select: ['page_authority','domain_authority','source_url','target_url','anchor_text','nofollow']
      });
      if (result.error) return res.status(400).json({ error: result.error });
      const items = (result.results || []).map(b => ({
        url_from: b.source_url,
        url_to: b.target_url,
        anchor: b.anchor_text || '',
        domain_authority: b.domain_authority || 0,
        page_authority: b.page_authority || 0,
        dofollow: !b.nofollow
      }));
      return res.status(200).json({ items });
    }

    // Compare two domains
    if (action === 'compare') {
      const [myResult, compResult] = await Promise.all([
        mozCall('url/metrics', { url: target, select: ['domain_authority','linking_root_domains','external_links'] }),
        mozCall('url/metrics', { url: competitor, select: ['domain_authority','linking_root_domains','external_links'] })
      ]);
      return res.status(200).json({
        mine: { domain: target, domain_authority: myResult.domain_authority||0, linking_domains: myResult.linking_root_domains||0, backlinks: myResult.external_links||0 },
        competitor: { domain: competitor, domain_authority: compResult.domain_authority||0, linking_domains: compResult.linking_root_domains||0, backlinks: compResult.external_links||0 }
      });
    }

    // Link gap - competitor's linking domains
    if (action === 'link_gap') {
      const result = await mozCall('links/root_domains', {
        target: competitor,
        scope: 'root_domain',
        limit: 50,
        select: ['domain_authority','source_domain','external_links_to_target']
      });
      const items = (result.results || []).map(d => ({
        domain: d.source_domain,
        domain_authority: d.domain_authority || 0,
        links_to_competitor: d.external_links_to_target || 0
      }));
      return res.status(200).json({ items, competitor });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Moz error:', error);
    return res.status(500).json({ error: error.message });
  }
}
