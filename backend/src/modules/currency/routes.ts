import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { sendSuccess, sendError } from '../../utils/response';
import logger from '../../utils/logger';
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
          return sendSuccess(res, { ...JSON.parse(cached), source: 'redis' });
        }
      }
    } catch (e) {}

    // Try live API
    try {
      const response = await fetch(`${EXCHANGE_API_BASE}/${base}`);
      if (response.ok) {
        const data: any = await response.json();
        const rates = data.rates;

        // Cache in Redis (1 hour)
        try {
          if (redisClient.isOpen) {
            await redisClient.setEx(`rates:${base}`, 3600, JSON.stringify({ base, rates, fetched_at: new Date().toISOString() }));
          }
        } catch (e) {}

        // Cache in DB for offline fallback
        const entries = Object.entries(rates).map(([target, rate]) => ({
          base_currency: base, target_currency: target, rate: rate as number, fetched_at: new Date(),
        }));
        for (const entry of entries) {
          await db('currency_cache').insert(entry).onConflict(['base_currency', 'target_currency']).merge();
        }

        return sendSuccess(res, { base, rates, fetched_at: new Date().toISOString(), source: 'api' });
      }
    } catch (apiErr) {
      logger.warn('Exchange rate API failed, falling back to cache', { error: String(apiErr) });
    }

    // Fallback to DB cache
    const cached = await db('currency_cache').where({ base_currency: base }).select('target_currency', 'rate', 'fetched_at');
    if (cached.length > 0) {
      const rates: Record<string, number> = {};
      cached.forEach((c: any) => { rates[c.target_currency] = parseFloat(c.rate); });
      logger.info(`Using DB fallback rates for ${base}`, { count: cached.length });
      return sendSuccess(res, { base, rates, fetched_at: cached[0].fetched_at, source: 'db_fallback', is_fallback: true });
    }

    sendError(res, 'Exchange rates unavailable', 503);
  } catch (err) {
    logger.error('Get rates error', err);
    sendError(res, 'Internal server error');
  }
});

// GET /api/currency/convert?from=USD&to=INR&amount=100
router.get('/convert', async (req: AuthRequest, res: Response) => {
  try {
    const from = (req.query.from as string || 'USD').toUpperCase();
    const to = (req.query.to as string || 'USD').toUpperCase();
    const amount = parseFloat(req.query.amount as string || '0');

    if (isNaN(amount) || amount <= 0) return sendError(res, 'Amount must be a positive number', 400);
    if (from.length !== 3 || to.length !== 3) return sendError(res, 'Invalid currency code', 400);
    if (from === to) return sendSuccess(res, { from, to, amount, converted_amount: amount, rate: 1, is_fallback: false });

    let rate: number | null = null;
    let isFallback = false;

    // Try Redis
    try {
      if (redisClient.isOpen) {
        const cached = await redisClient.get(`rates:${from}`);
        if (cached) rate = JSON.parse(cached).rates[to];
      }
    } catch (e) {}

    // Try API
    if (!rate) {
      try {
        const response = await fetch(`${EXCHANGE_API_BASE}/${from}`);
        if (response.ok) {
          const data: any = await response.json();
          rate = data.rates[to];
        }
      } catch (e) {
        logger.warn('Currency API failed during conversion', { from, to });
      }
    }

    // Fallback to DB — log fallback usage
    if (!rate) {
      const cached = await db('currency_cache')
        .where({ base_currency: from, target_currency: to }).first();
      if (cached) {
        rate = parseFloat(cached.rate);
        isFallback = true;
        logger.warn(`Using DB fallback rate for ${from}→${to}: ${rate}`, { fetched_at: cached.fetched_at });
      }
    }

    if (!rate) return sendError(res, 'Conversion rate unavailable', 503);

    const converted_amount = Math.round(amount * rate * 100) / 100;
    sendSuccess(res, { from, to, amount, converted_amount, rate, is_fallback: isFallback });
  } catch (err) {
    logger.error('Convert error', err);
    sendError(res, 'Internal server error');
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
  sendSuccess(res, { currencies });
});

export default router;
