import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { connectRedis } from './config/redis';
import { initWebSocket } from './websocket';
import logger from './utils/logger';
import { sendError } from './utils/response';

// Import routes
import authRoutes from './modules/auth/routes';
import userRoutes from './modules/users/routes';
import expenseRoutes from './modules/expenses/routes';
import approvalRoutes from './modules/approvals/routes';
import currencyRoutes from './modules/currency/routes';
import ocrRoutes from './modules/ocr/routes';

const app = express();
const server = createServer(app);

// ──────────────────────────────────────────────────
// RATE LIMITING
// ──────────────────────────────────────────────────

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // stricter for auth endpoints
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, error: 'Too many auth attempts, please try again later.' },
});

// ──────────────────────────────────────────────────
// MIDDLEWARE
// ──────────────────────────────────────────────────

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api') && req.path !== '/api/health') {
      logger.debug(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// Static files for uploads
app.use('/uploads', express.static(path.resolve(config.uploadDir)));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: { status: 'ok', timestamp: new Date().toISOString(), environment: process.env.NODE_ENV || 'development' },
    error: null,
  });
});

// ──────────────────────────────────────────────────
// ROUTES (with rate limiting)
// ──────────────────────────────────────────────────

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/expenses', apiLimiter, expenseRoutes);
app.use('/api/approvals', apiLimiter, approvalRoutes);
app.use('/api/currency', apiLimiter, currencyRoutes);
app.use('/api/ocr', apiLimiter, ocrRoutes);

// ──────────────────────────────────────────────────
// 404 Handler
// ──────────────────────────────────────────────────

app.use('/api/*', (req, res) => {
  sendError(res, `Route not found: ${req.method} ${req.path}`, 404);
});

// ──────────────────────────────────────────────────
// GLOBAL ERROR HANDLER
// ──────────────────────────────────────────────────

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return sendError(res, 'File too large. Maximum size is 10MB.', 413);
  }

  // Multer file type error
  if (err.message?.includes('Invalid file type')) {
    return sendError(res, err.message, 400);
  }

  // Zod validation error
  if (err.name === 'ZodError') {
    return sendError(res, 'Validation failed', 400, err.errors);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return sendError(res, 'Invalid token', 401);
  }
  if (err.name === 'TokenExpiredError') {
    return sendError(res, 'Token expired', 401);
  }

  logger.error('Unhandled error', { error: err.message, stack: err.stack, path: req.path });
  sendError(res, 'Internal server error');
});

// ──────────────────────────────────────────────────
// START SERVER
// ──────────────────────────────────────────────────

const start = async () => {
  await connectRedis();
  initWebSocket(server);

  server.listen(config.port, () => {
    logger.info(`
╔═══════════════════════════════════════════════════╗
║  Expense Reimbursement API Server                 ║
║  Running on http://localhost:${config.port}               ║
║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(36)}║
║  Rate limiting: ENABLED                           ║
║  WebSocket: ENABLED                               ║
╚═══════════════════════════════════════════════════╝`);
  });
};

start().catch((err) => {
  logger.error('Server start failed', err);
  process.exit(1);
});

export default app;
