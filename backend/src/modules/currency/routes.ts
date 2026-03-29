import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../../middleware/auth';
import db from '../../config/database';
import redisClient from '../../config/redis';

const router = Router();
router.use(authenticate);

const EXCHANGE_API_BASE = 'https://api.exchangerate-api.com/v4/latest';

// GET /api/currency/rates?base=USD
router.get('/rates', async (req: AuthRequest, res: Response) => {
  try {
    const base = (req.query.base as string || 'USD').toUpperCase();

    // Try Redis cache first
    try {
      if (redisClient.isOpen) {
        const cached = await redisClient.get(`rates:${base}`);
        if (cached) {
          res.json(JSON.parse(cached));
          return;
        }
      }
    } catch (e) {}

    // Try API
    try {
      const response = await fetch(`${EXCHANGE_API_BASE}/${base}`);
      if (response.ok) {
        const data = await response.json();
        const rates = data.rates;

        // Cache in Redis (1 hour)
        try {
          if (redisClient.isOpen) {
            await redisClient.setEx(`rates:${base}`, 3600, JSON.stringify({ base, rates, fetched_at: new Date().toISOString() }));
          }
        } catch (e) {}

        // Cache in DB for offline fallback
        const entries = Object.entries(rates).map(([target, rate]) => ({
          base_currency: base,
          target_currency: target,
          rate: rate as number,
          fetched_at: new Date(),
        }));

        // Upsert rates
        for (const entry of entries) {
          await db('currency_cache')
            .insert(entry)
            .onConflict(['base_currency', 'target_currency'])
            .merge();
        }

        res.json({ base, rates, fetched_at: new Date().toISOString(), source: 'api' });
        return;
      }
    } catch (apiErr) {
      console.warn('Exchange rate API failed, falling back to cache:', apiErr);
    }

    // Fallback to DB cache
    const cached = await db('currency_cache')
      .where({ base_currency: base })
      .select('target_currency', 'rate', 'fetched_at');

    if (cached.length > 0) {
      const rates: Record<string, number> = {};
      cached.forEach((c: any) => { rates[c.target_currency] = parseFloat(c.rate); });
      res.json({
        base,
        rates,
        fetched_at: cached[0].fetched_at,
        source: 'db_cache',
      });
      return;
    }

    res.status(503).json({ error: 'Exchange rates unavailable' });
  } catch (err) {
    console.error('Get rates error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/currency/convert?from=USD&to=INR&amount=100
router.get('/convert', async (req: AuthRequest, res: Response) => {
  try {
    const from = (req.query.from as string || 'USD').toUpperCase();
    const to = (req.query.to as string || 'USD').toUpperCase();
    const amount = parseFloat(req.query.amount as string || '0');

    if (amount <= 0) {
      res.status(400).json({ error: 'Amount must be positive' });
      return;
    }
    if (from === to) {
      res.json({ from, to, amount, converted_amount: amount, rate: 1 });
      return;
    }

    // Get rate
    let rate: number | null = null;

    // Try Redis
    try {
      if (redisClient.isOpen) {
        const cached = await redisClient.get(`rates:${from}`);
        if (cached) {
          const data = JSON.parse(cached);
          rate = data.rates[to];
        }
      }
    } catch (e) {}

    // Try API
    if (!rate) {
      try {
        const response = await fetch(`${EXCHANGE_API_BASE}/${from}`);
        if (response.ok) {
          const data = await response.json();
          rate = data.rates[to];
        }
      } catch (e) {}
    }

    // Fallback to DB
    if (!rate) {
      const cached = await db('currency_cache')
        .where({ base_currency: from, target_currency: to })
        .first();
      if (cached) rate = parseFloat(cached.rate);
    }

    if (!rate) {
      res.status(503).json({ error: 'Conversion rate unavailable' });
      return;
    }

    const converted_amount = Math.round(amount * rate * 100) / 100;

    res.json({ from, to, amount, converted_amount, rate });
  } catch (err) {
    console.error('Convert error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/currency/supported
router.get('/supported', async (req: AuthRequest, res: Response) => {
  const currencies = [
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'GBP', name: 'British Pound', symbol: '£' },
    { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
    { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
    { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
    { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
    { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
    { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
    { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
    { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
    { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
    { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
    { code: 'MXN', name: 'Mexican Peso', symbol: '$' },
    { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
    { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
    { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
    { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
    { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
    { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
    { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
    { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
    { code: 'THB', name: 'Thai Baht', symbol: '฿' },
    { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
    { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
    { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
    { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨' },
    { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
    { code: 'RUB', name: 'Russian Ruble', symbol: '₽' },
  ];
  res.json({ currencies });
});

export default router;
