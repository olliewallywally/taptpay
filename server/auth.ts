import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export interface User {
  id: number;
  email: string;
  password: string;
  merchantId: number;
  role: 'merchant' | 'admin';
  createdAt: Date;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

// In-memory user storage (replace with database in production)
const users: Map<number, User> = new Map();
let currentUserId = 1;

// Create default demo user
const hashedPassword = bcrypt.hashSync('demo123', 10);
users.set(1, {
  id: 1,
  email: 'demo@tapt.co.nz',
  password: hashedPassword,
  merchantId: 1,
  role: 'merchant',
  createdAt: new Date(),
});

export const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const user = Array.from(users.values()).find(u => u.email === email);
  if (!user) return null;
  
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) return null;
  
  return user;
}

export function generateToken(user: User): string {
  return jwt.sign(
    { 
      userId: user.id, 
      email: user.email, 
      merchantId: user.merchantId,
      role: user.role 
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }

  const user = users.get(decoded.userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  req.user = user;
  next();
}

export async function createUser(email: string, password: string, merchantId: number, role: 'merchant' | 'admin' = 'merchant'): Promise<User> {
  const hashedPassword = await bcrypt.hash(password, 10);
  const id = currentUserId++;
  
  const user: User = {
    id,
    email,
    password: hashedPassword,
    merchantId,
    role,
    createdAt: new Date(),
  };
  
  users.set(id, user);
  return user;
}

export function getUserByEmail(email: string): User | undefined {
  return Array.from(users.values()).find(u => u.email === email);
}

export function getUserById(id: number): User | undefined {
  return users.get(id);
}