import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { sendPasswordResetEmail } from './email-service';

export interface User {
  id: number;
  email: string;
  password: string;
  merchantId: number;
  role: 'merchant' | 'admin';
  resetToken?: string;
  resetTokenExpiry?: Date;
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
  // Check if user already exists
  const existingUser = getUserByEmail(email);
  if (existingUser) {
    throw new Error(`User with email ${email} already exists`);
  }

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
  console.log(`User created successfully: ${email} with ID ${id} for merchant ${merchantId}`);
  return user;
}

export function getUserByEmail(email: string): User | undefined {
  return Array.from(users.values()).find(u => u.email === email);
}

export function getUserById(id: number): User | undefined {
  return users.get(id);
}

// Password reset functionality
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function requestPasswordReset(email: string, baseUrl?: string): Promise<boolean> {
  const user = getUserByEmail(email);
  if (!user) {
    // Don't reveal if email exists or not for security
    return true;
  }

  const resetToken = generateResetToken();
  const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

  // Update user with reset token
  user.resetToken = resetToken;
  user.resetTokenExpiry = resetTokenExpiry;
  users.set(user.id, user);

  // Send reset email
  try {
    await sendPasswordResetEmail(email, resetToken, baseUrl);
    return true;
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return false;
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const user = Array.from(users.values()).find(u => u.resetToken === token);
  
  if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
    return false; // Invalid or expired token
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  // Update user
  user.password = hashedPassword;
  user.resetToken = undefined;
  user.resetTokenExpiry = undefined;
  users.set(user.id, user);

  return true;
}

export function validateResetToken(token: string): boolean {
  const user = Array.from(users.values()).find(u => u.resetToken === token);
  return user ? (user.resetTokenExpiry ? user.resetTokenExpiry > new Date() : false) : false;
}