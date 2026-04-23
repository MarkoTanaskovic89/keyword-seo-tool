module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REDIRECT_URI = 'https://app.markotanaskovic.com/backlink-assistant';

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) {} }
  const { action } = body || {};

  try {
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

    if (action === 'exchange_token') {
      const { code } = body;
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
      if (data.error) return res.status(400).json({ error: data.error_description || data.error });
      return res.status(200).json({ access_token: data.access_token });
    }

    if (action === 'get_sites') {
      const { access_token } = body;
      const response = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
        headers: { 'Authorization': 'Bearer ' + access_token }
      });
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch(e) {
        return res.status(500).json({ error: 'Google API error: ' + text.slice(0, 200) });
      }
      if (data.error) return res.status(400).json({ error: data.error.message });
      return res.status(200).json({ sites: data.siteEntry || [] });
    }

    if (action === 'get_backlinks') {
      const { access_token, site_url } = body;
      const endDate = new Date().toISOString().slice(0, 10);
      const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      // Use webmasters v3 API - correct endpoint
      const encoded = encodeURIComponent(site_url);
      
      const fetchData = async (dimension) => {
        const url = `https://www.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`;
        console.log('Fetching:', url);
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + access_token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            startDate,
            endDate,
            dimensions: [dimension],
            rowLimit: 100
          })
        });
        const text = await r.text();
        console.log('Response status:', r.status, 'body:', text.slice(0, 200));
        try { return JSON.parse(text); }
        catch(e) { return { error: text.slice(0, 300) }; }
      };

      const pagesData = await fetchData('page');
      if (pagesData.error) return res.status(400).json({ error: 'Pages error: ' + JSON.stringify(pagesData.error) });

      const queriesData = await fetchData('query');

      const pages = (pagesData.rows || []).map(r => ({
        page: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: (r.ctr * 100).toFixed(1) + '%',
        position: Math.round(r.position)
      }));

      const queries = (queriesData.rows || []).map(r => ({
        query: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: (r.ctr * 100).toFixed(1),
        position: Math.round(r.position)
      }));

      return res.status(200).json({ pages, queries });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('GSC error:', error);
    return res.status(500).json({ error: error.message });
  }
}
