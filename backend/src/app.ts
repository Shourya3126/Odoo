import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer } from 'http';
import { config } from './config';
import { connectRedis } from './config/redis';
import { initWebSocket } from './websocket';

// Import routes
import authRoutes from './modules/auth/routes';
import userRoutes from './modules/users/routes';
import expenseRoutes from './modules/expenses/routes';
import approvalRoutes from './modules/approvals/routes';
import currencyRoutes from './modules/currency/routes';
import ocrRoutes from './modules/ocr/routes';

const app = express();
const server = createServer(app);

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files for uploads
app.use('/uploads', express.static(path.resolve(config.uploadDir)));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/currency', currencyRoutes);
app.use('/api/ocr', ocrRoutes);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const start = async () => {
  // Connect Redis (non-blocking)
  await connectRedis();

  // Initialize WebSocket
  initWebSocket(server);

  server.listen(config.port, () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║  Expense Reimbursement API Server                 ║
║  Running on http://localhost:${config.port}               ║
║  WebSocket enabled                                ║
╚═══════════════════════════════════════════════════╝
    `);
  });
};

start().catch(console.error);

export default app;
