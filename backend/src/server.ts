import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from './models/User';

// Import routes
import authRoutes from './routes/auth.routes';
import gameRoutes from './routes/game.routes';
import userRoutes from './routes/user.routes';
import promotionRoutes from './routes/promotion.routes';
import transactionRoutes from './routes/transaction.routes';

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cassanova';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/users', userRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/transactions', transactionRoutes);

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', message: 'Cassanova API is running' });
});

// Database connection
mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');

    // Optional demo-user seed. Enable with SEED_DEMO_USER=true and provide
    // DEMO_USER_EMAIL / DEMO_USER_PASSWORD in the hosting environment.
    if (process.env.SEED_DEMO_USER === 'true') {
      const email = process.env.DEMO_USER_EMAIL;
      const password = process.env.DEMO_USER_PASSWORD;
      if (email && password) {
        const existing = await User.findOne({ email });
        if (!existing) {
          const username = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
          const hashedPassword = await bcrypt.hash(password, 10);
          await User.create({
            username,
            email,
            password: hashedPassword,
            isVerified: true,
          });
          console.log(`Demo user created: ${email}`);
        } else {
          console.log(`Demo user already exists: ${email}`);
        }
      }
    }

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
  });

export default app;
