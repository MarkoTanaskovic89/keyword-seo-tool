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
    const r = await fetch(`https://lsapi.seomoz.com/v2/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MOZ_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const text = await r.text();
    console.log(`Moz ${endpoint} status:`, r.status, text.slice(0,300));
    try { return JSON.parse(text); }
    catch(e) { throw new Error('Moz API error: ' + text.slice(0, 200)); }
  };

  try {
    if (action === 'summary') {
      const result = await mozCall('url/metrics', {
        targets: [target],
        select: ['domain_authority','page_authority','spam_score','linking_root_domains','root_domains_to_root_domain','external_links_to_root_domain']
      });
      if (result.error) return res.status(400).json({ error: result.error });
      const r = result.results?.[0] || result;
      return res.status(200).json({
        domain_authority: r.domain_authority || 0,
        page_authority: r.page_authority || 0,
        spam_score: r.spam_score || 0,
        linking_domains: r.linking_root_domains || r.root_domains_to_root_domain || 0,
        total_backlinks: r.external_links_to_root_domain || 0
      });
    }

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

    if (action === 'compare') {
      const [myResult, compResult] = await Promise.all([
        mozCall('url/metrics', { targets: [target], select: ['domain_authority','linking_root_domains','external_links_to_root_domain'] }),
        mozCall('url/metrics', { targets: [competitor], select: ['domain_authority','linking_root_domains','external_links_to_root_domain'] })
      ]);
      const m = myResult.results?.[0] || myResult;
      const c = compResult.results?.[0] || compResult;
      return res.status(200).json({
        mine: { domain: target, domain_authority: m.domain_authority||0, linking_domains: m.linking_root_domains||0, backlinks: m.external_links_to_root_domain||0 },
        competitor: { domain: competitor, domain_authority: c.domain_authority||0, linking_domains: c.linking_root_domains||0, backlinks: c.external_links_to_root_domain||0 }
      });
    }

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
