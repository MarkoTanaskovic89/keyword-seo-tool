module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REDIRECT_URI = 'https://app.markotanaskovic.com/backlink-assistant';

  const { action } = req.method === 'POST' ? req.body : req.query;

  try {
    // Step 1: Get OAuth URL
    if (action === 'auth_url') {
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/webmasters.readonly',
        access_type: 'offline',
        prompt: 'consent'
      });
      return res.status(200).json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + params });
    }

    // Step 2: Exchange code for token
    if (action === 'exchange_token') {
      const { code } = req.body;
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code'
        })
      });
      const data = await response.json();
      if (data.error) return res.status(400).json({ error: data.error_description });
      return res.status(200).json({ access_token: data.access_token, refresh_token: data.refresh_token });
    }

    // Step 3: Get list of sites
    if (action === 'get_sites') {
      const { access_token } = req.body;
      const response = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
        headers: { 'Authorization': 'Bearer ' + access_token }
      });
      const data = await response.json();
      if (data.error) return res.status(400).json({ error: data.error.message });
      return res.status(200).json({ sites: data.siteEntry || [] });
    }

    // Step 4: Get backlinks for a site
    if (action === 'get_backlinks') {
      const { access_token, site_url } = req.body;
      const encoded = encodeURIComponent(site_url);
      const response = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encoded}/sitemaps`,
        { headers: { 'Authorization': 'Bearer ' + access_token } }
      );

      // Get search analytics - linking sites
      const linksResponse = await fetch(
        `https://searchconsole.googleapis.com/v1/sites/${encoded}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + access_token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            endDate: new Date().toISOString().slice(0, 10),
            dimensions: ['page'],
            rowLimit: 100,
            dimensionFilterGroups: []
          })
        }
      );

      const linksData = await linksResponse.json();

      // Get top pages with clicks
      const pages = (linksData.rows || []).map(r => ({
        page: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: (r.ctr * 100).toFixed(1) + '%',
        position: Math.round(r.position)
      }));

      // Also get linking sites via searchconsole links API
      const backlinksResponse = await fetch(
        `https://searchconsole.googleapis.com/v1/sites/${encoded}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + access_token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            endDate: new Date().toISOString().slice(0, 10),
            dimensions: ['query'],
            rowLimit: 50
          })
        }
      );
      const queryData = await backlinksResponse.json();
      const queries = (queryData.rows || []).map(r => ({
        query: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        position: Math.round(r.position)
      }));

      return res.status(200).json({ pages, queries });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('GSC error:', error);
    return res.status(500).json({ error: 'Server error: ' + error.message });
  }
}
