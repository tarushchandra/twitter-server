import { Redis } from "ioredis";

// export const redisClient = new Redis(process.env.REDIS_URI!);

export const redisClient = new Redis(
  "rediss://default:5bd78eedce07457a809ff284c9ee45f8@apn1-above-burro-35000.upstash.io:35000"
);
