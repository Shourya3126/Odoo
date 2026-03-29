import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { sendSuccess, sendError } from '../../utils/response';
import logger from '../../utils/logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../../config';

const router = Router();
router.use(authenticate);

// Configure multer for OCR uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.resolve(config.uploadDir, 'ocr');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Invalid file type for OCR. Use image files.'));
  },
});

// POST /api/ocr - Upload receipt and extract text
router.post('/', upload.single('receipt'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return sendError(res, 'No file uploaded', 400);
    }

    const filePath = req.file.path;

    // Dynamically import Tesseract.js
    let extractedText = '';
    try {
      const Tesseract = await import('tesseract.js');
      const { data } = await Tesseract.recognize(filePath, 'eng', {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
          }
        },
      });
      extractedText = data.text;
    } catch (ocrErr) {
      logger.warn('Tesseract OCR failed', { error: String(ocrErr) });
      return sendSuccess(res, {
        receipt_url: `/uploads/ocr/${req.file.filename}`,
        ocr_success: false, extracted: null, raw_text: null,
        message: 'OCR processing failed, receipt uploaded successfully',
      });
    }

    // Parse extracted text
    const parsed = parseReceiptText(extractedText);

    sendSuccess(res, {
      receipt_url: `/uploads/ocr/${req.file.filename}`,
      ocr_success: true, extracted: parsed, raw_text: extractedText,
    });
  } catch (err) {
    logger.error('OCR error', err);
    sendError(res, 'Internal server error');
  }
});

// Helper: Parse receipt text into structured data
function parseReceiptText(text: string): {
  amount: number | null;
  date: string | null;
  vendor: string | null;
} {
  const result: { amount: number | null; date: string | null; vendor: string | null } = {
    amount: null,
    date: null,
    vendor: null,
  };

  // Extract amount — look for patterns like $123.45, 123.45, Total: 123.45
  const amountPatterns = [
    /(?:total|amount|grand\s*total|subtotal|sum|balance\s*due)[:\s]*[\$€£₹¥]?\s*([0-9,]+\.?\d{0,2})/i,
    /[\$€£₹¥]\s*([0-9,]+\.\d{2})/,
    /([0-9,]+\.\d{2})\s*(?:USD|EUR|GBP|INR)/i,
  ];

  for (const pattern of amountPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.amount = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }

  // If still no amount, find the largest decimal number
  if (!result.amount) {
    const allAmounts = text.match(/\d+\.\d{2}/g);
    if (allAmounts) {
      const amounts = allAmounts.map(a => parseFloat(a)).filter(a => a > 0);
      if (amounts.length > 0) {
        result.amount = Math.max(...amounts);
      }
    }
  }

  // Extract date
  const datePatterns = [
    /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/,
    /(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/,
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/i,
    /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})/i,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      result.date = match[1];
      break;
    }
  }

  // Extract vendor — typically the first line or prominent text
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  if (lines.length > 0) {
    // First non-numeric, non-date line is likely the vendor
    for (const line of lines.slice(0, 5)) {
      if (!/^\d/.test(line) && !/total|amount|subtotal|tax|date/i.test(line) && line.length < 60) {
        result.vendor = line;
        break;
      }
    }
  }

  return result;
}

export default router;
