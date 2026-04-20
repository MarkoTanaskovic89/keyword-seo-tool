export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { keyword, country } = req.body;
  if (!keyword) return res.status(400).json({ error: 'Keyword is required' });

  try {
    const accessToken = await getAccessToken();
    const keywords = await getKeywordIdeas(accessToken, keyword, country);
    res.status(200).json({ keywords });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function getAccessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });
  const data = await response.json();
  if (!data.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(data));
  return data.access_token;
}

async function getKeywordIdeas(accessToken, keyword, country) {
  const countryMap = {
    'worldwide': null, 'US': '2840', 'GB': '2826', 'DE': '2276', 'FR': '2250',
    'IT': '2380', 'ES': '2724', 'NL': '2528', 'BE': '2056', 'AT': '2040',
    'CH': '2756', 'SE': '2752', 'NO': '2578', 'DK': '2208', 'FI': '2246',
    'PL': '2616', 'CZ': '2203', 'HU': '2348', 'RO': '2642', 'GR': '2300',
    'PT': '2620', 'RS': '2688', 'HR': '2191', 'BA': '2070', 'SI': '2705',
    'AU': '2036', 'NZ': '2554', 'CA': '2124', 'IN': '2356', 'BR': '2076',
    'MX': '2484', 'AR': '2032', 'ZA': '2710', 'NG': '2566', 'EG': '2818',
    'TR': '2792', 'IL': '2376', 'AE': '2784', 'SA': '2682', 'RU': '2643',
    'UA': '2804', 'JP': '2392', 'KR': '2410', 'CN': '2156', 'SG': '2702',
    'MY': '2458', 'ID': '2360', 'TH': '2764', 'VN': '2704', 'PH': '2608'
  };

  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  const geoTarget = countryMap[country];

  const requestBody = {
    keywordSeed: { keywords: [keyword] },
    keywordPlanNetwork: 'GOOGLE_SEARCH',
    includeAdultKeywords: false,
    ...(geoTarget && { geoTargetConstants: [`geoTargetConstants/${geoTarget}`] }),
    language: 'languageConstants/1000'
  };

  const response = await fetch(
    `https://googleads.googleapis.com/v18/customers/${customerId}:generateKeywordIdeas`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
        'Content-Type': 'application/json',
        'login-customer-id': customerId
      },
      body: JSON.stringify(requestBody)
    }
  );

  const data = await response.json();

  if (data.error) throw new Error('Google Ads API error: ' + JSON.stringify(data.error));
  if (!data.results) return [];

  return data.results.slice(0, 30).map(result => {
    const metrics = result.keywordIdeaMetrics || {};
    const monthlySearches = metrics.monthlySearchVolumes || [];
    const avgVolume = metrics.avgMonthlySearches ? parseInt(metrics.avgMonthlySearches) : 0;
    const comp = metrics.competition || 'UNSPECIFIED';
    const compMap = { 'LOW': 'LOW', 'MEDIUM': 'MEDIUM', 'HIGH': 'HIGH', 'UNSPECIFIED': 'MEDIUM' };
    const cpcMicros = metrics.averageCpcMicros ? parseInt(metrics.averageCpcMicros) : 0;
    const cpc = cpcMicros / 1000000;

    const trend = monthlySearches.length >= 2
      ? (monthlySearches[monthlySearches.length - 1].monthlySearches > monthlySearches[0].monthlySearches ? 'rising' : 'stable')
      : 'stable';

    const hist = monthlySearches.slice(-12).map(m => parseInt(m.monthlySearches) || 0);
    while (hist.length < 12) hist.unshift(avgVolume);

    return {
      keyword: result.text,
      volume: avgVolume,
      cpc: parseFloat(cpc.toFixed(2)),
      competition: compMap[comp] || 'MEDIUM',
      trend: trend,
      hist: hist,
      score: calcScore(avgVolume, comp, trend)
    };
  });
}

function calcScore(volume, comp, trend) {
  let score = 50;
  if (volume > 10000) score += 20;
  else if (volume > 1000) score += 10;
  else if (volume < 100) score -= 10;
  if (comp === 'LOW') score += 25;
  else if (comp === 'HIGH') score -= 20;
  if (trend === 'rising') score += 15;
  else if (trend === 'falling') score -= 10;
  return Math.min(99, Math.max(10, score));
}
