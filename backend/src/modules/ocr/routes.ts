import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AuthRequest } from '../../middleware/auth';
import { sendSuccess, sendError } from '../../utils/response';
import { config } from '../../config';
import { logger } from '../../utils/logger';

const router = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.resolve(process.cwd(), config.uploadDir, 'ocr');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.pdf', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

// POST /api/ocr - Upload receipt and extract text
router.post('/', upload.single('receipt'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return sendError(res, 'No file uploaded', 400);
    }

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const filename = req.file.filename;

    let extractedText = '';
    
    // NATIVE SCANNING: Bypass LLM entirely, rely purely on Tesseract and PDF Parse
    try {
      if (ext === '.pdf') {
        const pdfParseModule = await import('pdf-parse');
        const pdfParse = (pdfParseModule.default || pdfParseModule) as any;
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        extractedText = data.text;
      } else {
        const Tesseract = await import('tesseract.js');
        const { data } = await Tesseract.recognize(filePath, 'eng', {
          logger: (m: any) => {
            if (m.status === 'recognizing text') console.log(`[OCR] progress: ${Math.round(m.progress * 100)}%`);
          },
        });
        extractedText = data.text;
      }
    } catch (parseErr) {
      logger.warn('Document parsing failed', { error: String(parseErr) });
      return sendSuccess(res, {
        receipt_url: `/uploads/ocr/${filename}`,
        ocr_success: false, extracted: null, raw_text: null,
        message: 'Processing failed, file uploaded successfully',
      });
    }

    const parsed = parseRobustReceiptText(extractedText);
    sendSuccess(res, {
      receipt_url: `/uploads/ocr/${filename}`,
      ocr_success: true, extracted: parsed, raw_text: extractedText,
    });
  } catch (err) {
    logger.error('OCR error', err);
    sendError(res, 'Internal server error');
  }
});

// Helper: Aggressive Offline RegEx Parser
function parseRobustReceiptText(text: string): { amount: number | null; date: string | null; vendor: string | null; description: string | null } {
  const result: { amount: number | null; date: string | null; vendor: string | null; description: string | null } = {
    amount: null, date: null, vendor: null, description: 'Receipt processed via local OCR scanner',
  };

  // 1. EXTRACT AMOUNT: Find ALL currency-like values and select the mathematical maximum.
  // This bypasses structural errors from Tesseract by assuming the Total is natively the largest relevant number.
  // Captures exact 2 decimal patterns: 12.34, 1,234.56, 12,345.67
  const numberRegex = /(?:^|\s|\$|€|£|₹|¥|Total|Sum)[:\s]*([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2})(?:\s|$|[A-Za-z])/gi;
  let maxAmount = 0;
  let match;
  
  while ((match = numberRegex.exec(text)) !== null) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      // Filter out years or noise that falsely match exactly 2 decimals
      if (val > 0 && val !== 20.23 && val !== 20.24 && val !== 20.25 && val !== 20.26) {
          if (val > maxAmount) {
              maxAmount = val;
          }
      }
  }
  
  if (maxAmount === 0) {
      // Fallback: search for absolutely any sequence of digits with a forced 2-decimal trailing end
      const fallbackRegex = /(\d+\.\d{2})/g;
      while ((match = fallbackRegex.exec(text)) !== null) {
          const val = parseFloat(match[1]);
          if (val > maxAmount && val !== 20.24 && val !== 20.25) maxAmount = val;
      }
  }
  
  result.amount = maxAmount > 0 ? maxAmount : null;

  // 2. EXTRACT DATE: Strict date pattern matching
  const datePatterns = [
    /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/, // DD/MM/YYYY
    /(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/,   // YYYY-MM-DD
    /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\.,]?\s+\d{4})/i, // 15 Jan 2024
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\.,]?\s+\d{1,2}[\.,]?\s+\d{4})/i, // Jan 15 2024
  ];
  for (const pattern of datePatterns) {
    const dMatch = text.match(pattern);
    if (dMatch) {
      result.date = dMatch[1].replace(/\./g, '-');
      break;
    }
  }

  // 3. EXTRACT VENDOR: First solid text line excluding noise
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length >= 3);
  for (const line of lines.slice(0, 10)) { // Vendor is almost always in the top 10 lines
    const upper = line.toUpperCase();
    if (
        !/^\d/.test(line) && 
        !/(?:RECEIPT|TAX|INVOICE|TOTAL|CASH|VISA|MASTERCARD|DATE|TIME|PAYMENT)/.test(upper) &&
        line.length < 50
    ) {
        // Drop Tesseract noise characters
        const cleanVendor = line.replace(/[\|\[\]\{\}\\\/]/g, '').trim();
        if (cleanVendor.length >= 3) {
            result.vendor = cleanVendor;
            break;
        }
    }
  }

  return result;
}

export default router;
