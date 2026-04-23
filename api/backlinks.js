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
    const url = `https://lsapi.seomoz.com/v2/${endpoint}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'x-moz-token': MOZ_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const text = await r.text();
    console.log(`Moz ${endpoint} [${r.status}]:`, text.slice(0, 400));
    try { return JSON.parse(text); }
    catch(e) { throw new Error('Moz API error: ' + text.slice(0, 200)); }
  };

  try {
    if (action === 'summary') {
      const result = await mozCall('url_metrics', {
        targets: [target],
        select: ['domain_authority', 'page_authority', 'spam_score', 'root_domains_to_root_domain', 'external_links_to_root_domain']
      });
      const m = (result.results && result.results[0]) || result;
      return res.status(200).json({
        domain_authority: m.domain_authority || 0,
        page_authority: m.page_authority || 0,
        spam_score: m.spam_score || 0,
        linking_domains: m.root_domains_to_root_domain || 0,
        total_backlinks: m.external_pages_to_page || m.pages_to_page || 0
      });
    }

    if (action === 'referring_domains') {
      const result = await mozCall('linking_root_domains', {
        target,
        target_scope: 'root_domain',
        limit: 50,
        select: ['domain_authority', 'root_domain', 'external_links_to_target']
      });
      const items = (result.results || []).map(d => ({
        domain: d.root_domain || d.domain || '',
        domain_authority: d.domain_authority || 0,
        links_to_target: (d.to_target && d.to_target.pages) || d.external_links_to_target || 0
      }));
      return res.status(200).json({ items });
    }

    if (action === 'backlinks') {
      const result = await mozCall('links', {
        target,
        target_scope: 'root_domain',
        filter: 'external',
        limit: 50,
        select: ['page_authority', 'domain_authority', 'source_url', 'target_url', 'anchor_text', 'nofollow']
      });
      const items = (result.results || []).map(b => ({
        url_from: (b.source && ('https://' + b.source.page)) || b.source_url || '',
        url_to: (b.target && ('https://' + b.target.page)) || b.target_url || '',
        anchor: b.anchor_text || '',
        domain_authority: (b.source && b.source.domain_authority) || b.domain_authority || 0,
        page_authority: (b.source && b.source.page_authority) || b.page_authority || 0,
        dofollow: !b.nofollow
      }));
      return res.status(200).json({ items });
    }

    if (action === 'compare') {
      const result = await mozCall('url_metrics', {
        targets: [target, competitor],
        select: ['domain_authority', 'root_domains_to_root_domain', 'external_links_to_root_domain']
      });
      const results = result.results || [];
      const m = results[0] || {};
      const c = results[1] || {};
      return res.status(200).json({
        mine: { domain: target, domain_authority: m.domain_authority||0, linking_domains: m.root_domains_to_root_domain||0, backlinks: m.external_links_to_root_domain||0 },
        competitor: { domain: competitor, domain_authority: c.domain_authority||0, linking_domains: c.root_domains_to_root_domain||0, backlinks: c.external_links_to_root_domain||0 }
      });
    }

    if (action === 'link_gap') {
      const result = await mozCall('linking_root_domains', {
        target: competitor,
        target_scope: 'root_domain',
        limit: 50,
        select: ['domain_authority', 'root_domain', 'external_links_to_target']
      });
      const items = (result.results || []).map(d => ({
        domain: d.root_domain || d.domain,
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
