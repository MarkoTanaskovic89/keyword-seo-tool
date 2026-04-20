module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, email, password, gdpr_consent } = req.body;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    if (action === 'signup') {
      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ email, password })
      });

      const authData = await authRes.json();
      if (authData.error) {
        return res.status(400).json({ error: authData.error.message || authData.error });
      }

      const userId = authData.id || (authData.user && authData.user.id);
      const token = authData.access_token || (authData.session && authData.session.access_token) || '';

      if (userId) {
        try {
          await fetch(`${SUPABASE_URL}/rest/v1/users`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ email, gdpr_consent: gdpr_consent || false, plan: 'free' })
          });
        } catch(e) {
          console.log('Users table error:', e.message);
        }
        return res.status(200).json({ success: true, token, user: { email } });
      }

      return res.status(400).json({ error: 'Signup failed. Please try again.' });
    }

    if (action === 'login') {
      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ email, password })
      });

      const authData = await authRes.json();
      if (authData.error) {
        return res.status(400).json({ error: 'Invalid email or password.' });
      }

      return res.status(200).json({ success: true, token: authData.access_token, user: { email } });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
}
