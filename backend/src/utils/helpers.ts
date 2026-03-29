import db from '../config/database';
import { AuthRequest } from '../middleware/auth';

interface AuditLogEntry {
  company_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string;
  details?: Record<string, any>;
}

export const createAuditLog = async (entry: AuditLogEntry): Promise<void> => {
  await db('audit_logs').insert(entry);
};

export const getAuditLogs = async (
  companyId: string,
  entityType: string,
  entityId: string
) => {
  return db('audit_logs')
    .where({ company_id: companyId, entity_type: entityType, entity_id: entityId })
    .orderBy('created_at', 'desc');
};

export const generateRandomPassword = (length: number = 12): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

// Country to Currency mapping
export const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  US: 'USD', GB: 'GBP', IN: 'INR', EU: 'EUR', JP: 'JPY',
  CA: 'CAD', AU: 'AUD', CN: 'CNY', CH: 'CHF', SG: 'SGD',
  HK: 'HKD', NZ: 'NZD', KR: 'KRW', MX: 'MXN', BR: 'BRL',
  ZA: 'ZAR', AE: 'AED', SA: 'SAR', SE: 'SEK', NO: 'NOK',
  DK: 'DKK', PL: 'PLN', TH: 'THB', MY: 'MYR', ID: 'IDR',
  PH: 'PHP', VN: 'VND', EG: 'EGP', NG: 'NGN', KE: 'KES',
  DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR',
  BE: 'EUR', AT: 'EUR', PT: 'EUR', GR: 'EUR', IE: 'EUR',
  FI: 'EUR', RU: 'RUB', TR: 'TRY', IL: 'ILS', PK: 'PKR',
  BD: 'BDT', LK: 'LKR', NP: 'NPR', TW: 'TWD', CL: 'CLP',
  CO: 'COP', PE: 'PEN', AR: 'ARS',
};

export const getCurrencyForCountry = (countryCode: string): string => {
  return COUNTRY_CURRENCY_MAP[countryCode.toUpperCase()] || 'USD';
};
