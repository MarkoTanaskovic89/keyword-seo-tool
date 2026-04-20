module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, email } = req.body;
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

  if (!STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  try {
    if (action === 'create_checkout') {
      const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          'mode': 'subscription',
          'line_items[0][price]': 'price_1TOMmgRiavfS7xZSfRdtVoyZ',
          'line_items[0][quantity]': '1',
          'success_url': 'https://keyword-seo-tool.vercel.app/?upgraded=true',
          'cancel_url': 'https://keyword-seo-tool.vercel.app/',
          'customer_email': email || '',
          'allow_promotion_codes': 'true'
        })
      });

      const session = await response.json();
      if (session.error) return res.status(400).json({ error: session.error.message });
      return res.status(200).json({ url: session.url });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Stripe error:', error);
    return res.status(500).json({ error: 'Payment error. Please try again.' });
  }
}

