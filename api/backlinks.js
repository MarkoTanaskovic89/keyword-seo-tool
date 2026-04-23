module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const LOGIN = process.env.DATAFORSEO_LOGIN;
  const PASSWORD = process.env.DATAFORSEO_PASSWORD;
  const auth = Buffer.from(`${LOGIN}:${PASSWORD}`).toString('base64');

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) {} }
  const { action, target, competitor } = body || {};

  const dfsCall = async (endpoint, payload) => {
    const r = await fetch(`https://api.dataforseo.com/v3/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (data.status_code !== 20000) throw new Error(data.status_message || 'DataForSEO error');
    return data.tasks?.[0]?.result?.[0] || {};
  };

  try {
    // Get backlink summary for a domain
    if (action === 'summary') {
      const result = await dfsCall('backlinks/summary/live', [{
        target,
        include_subdomains: true
      }]);
      return res.status(200).json({
        total_backlinks: result.total_count || 0,
        referring_domains: result.referring_domains || 0,
        referring_ips: result.referring_ips || 0,
        broken_backlinks: result.broken_backlinks || 0,
        dofollow: result.backlinks_spam_score || 0,
        domain_rank: result.rank || 0,
        backlinks_spam_score: result.backlinks_spam_score || 0
      });
    }

    // Get backlinks list
    if (action === 'backlinks') {
      const result = await dfsCall('backlinks/backlinks/live', [{
        target,
        limit: 100,
        order_by: ['rank,desc'],
        filters: ['dofollow,=,true']
      }]);
      const items = (result.items || []).map(b => ({
        url_from: b.url_from,
        domain_from: b.domain_from,
        url_to: b.url_to,
        anchor: b.anchor,
        dofollow: b.dofollow,
        rank: b.rank,
        domain_from_rank: b.domain_from_rank,
        first_seen: b.first_seen?.slice(0, 10),
        last_visited: b.last_visited?.slice(0, 10)
      }));
      return res.status(200).json({ items, total: result.total_count || 0 });
    }

    // Get referring domains
    if (action === 'referring_domains') {
      const result = await dfsCall('backlinks/referring_domains/live', [{
        target,
        limit: 100,
        order_by: ['rank,desc']
      }]);
      const items = (result.items || []).map(d => ({
        domain: d.domain,
        rank: d.rank,
        backlinks: d.backlinks,
        broken_backlinks: d.broken_backlinks,
        dofollow: d.referring_links_types?.anchor || 0,
        first_seen: d.first_seen?.slice(0, 10)
      }));
      return res.status(200).json({ items, total: result.total_count || 0 });
    }

    // Compare with competitor
    if (action === 'compare') {
      const [myResult, compResult] = await Promise.all([
        dfsCall('backlinks/summary/live', [{ target, include_subdomains: true }]),
        dfsCall('backlinks/summary/live', [{ target: competitor, include_subdomains: true }])
      ]);
      return res.status(200).json({
        mine: {
          domain: target,
          backlinks: myResult.total_count || 0,
          referring_domains: myResult.referring_domains || 0,
          rank: myResult.rank || 0
        },
        competitor: {
          domain: competitor,
          backlinks: compResult.total_count || 0,
          referring_domains: compResult.referring_domains || 0,
          rank: compResult.rank || 0
        }
      });
    }

    // Get competitor's backlinks I don't have (link gap)
    if (action === 'link_gap') {
      const result = await dfsCall('backlinks/referring_domains/live', [{
        target: competitor,
        limit: 50,
        order_by: ['rank,desc']
      }]);
      const items = (result.items || []).map(d => ({
        domain: d.domain,
        rank: d.rank,
        backlinks: d.backlinks,
        opportunity: 'Link from ' + d.domain + ' to ' + competitor + ' — reach out!'
      }));
      return res.status(200).json({ items, competitor });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('DataForSEO error:', error);
    return res.status(500).json({ error: error.message });
  }
}

