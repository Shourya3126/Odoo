import { createClient } from 'redis';
import { config } from './index';

const redisClient = createClient({
  url: config.redis.url,
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err.message);
});

redisClient.on('connect', () => {
  console.log('✅ Redis connected');
});

export const connectRedis = async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.warn('⚠️ Redis connection failed. Running without cache.');
  }
};

export default redisClient;
