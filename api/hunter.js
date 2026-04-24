module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const HUNTER_KEY = process.env.HUNTER_API_KEY;
  if (!HUNTER_KEY) return res.status(500).json({ error: 'Hunter API not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) {} }
  const { action, domain, email, subject, message, from_name, from_email } = body || {};

  try {
    // Find email for domain
    if (action === 'find_email') {
      const r = await fetch(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=5&api_key=${HUNTER_KEY}`);
      const data = await r.json();
      if (data.errors) return res.status(400).json({ error: data.errors[0].details });
      
      const emails = (data.data?.emails || []).map(e => ({
        email: e.value,
        name: [e.first_name, e.last_name].filter(Boolean).join(' ') || null,
        position: e.position || null,
        confidence: e.confidence || 0,
        type: e.type || 'generic'
      }));

      return res.status(200).json({ 
        domain,
        emails,
        organization: data.data?.organization || domain
      });
    }

    // Send email via Hunter campaigns
    if (action === 'send_email') {
      // Hunter doesn't send emails directly - use mailto or SMTP
      // Return formatted mailto link
      const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      return res.status(200).json({ 
        mailto: mailtoLink,
        email,
        subject,
        message
      });
    }

    // Verify email
    if (action === 'verify_email') {
      const r = await fetch(`https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${HUNTER_KEY}`);
      const data = await r.json();
      return res.status(200).json({
        email,
        status: data.data?.status || 'unknown',
        score: data.data?.score || 0
      });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch(error) {
    console.error('Hunter error:', error);
    return res.status(500).json({ error: error.message });
  }
}
