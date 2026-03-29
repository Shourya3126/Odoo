import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthPayload } from '../middleware/auth';

let io: SocketServer;

export const initWebSocket = (server: HttpServer) => {
  io = new SocketServer(server, {
    cors: {
      origin: ['http://localhost:5173', 'http://localhost:3000'],
      methods: ['GET', 'POST'],
    },
  });

  // Auth middleware for Socket.IO
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = jwt.verify(token, config.jwt.secret) as AuthPayload;
      (socket as any).user = payload;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket as any).user as AuthPayload;
    console.log(`🔌 User connected: ${user.email} (${user.role})`);

    // Join company room
    socket.join(`company:${user.companyId}`);
    // Join personal room
    socket.join(`user:${user.userId}`);

    socket.on('disconnect', () => {
      console.log(`🔌 User disconnected: ${user.email}`);
    });
  });

  console.log('✅ WebSocket initialized');
  return io;
};

export const getIO = (): SocketServer => {
  if (!io) {
    throw new Error('WebSocket not initialized');
  }
  return io;
};
