import { getDb } from './database';
import { merchants, transactions } from '@shared/schema';
import { createUser } from './auth';

export async function seedDatabase() {
  const db = getDb();
  if (!db) {
    console.log('Database not available for seeding');
    return;
  }

  try {
    // DATA SAFETY GUARD — do not remove this check.
    // This function only runs once (on a fresh empty database). If any merchants
    // already exist, we bail out immediately to ensure live merchant data,
    // stock_items, and transactions are NEVER truncated, overwritten, or replaced
    // by seed data. Never add DELETE/TRUNCATE statements above or below this guard.
    const existingMerchants = await db.select().from(merchants).limit(1);
    if (existingMerchants.length > 0) {
      console.log('Database already seeded');
      return;
    }

    console.log('Seeding database...');

    // Create demo merchant
    const demoMerchant = await db.insert(merchants).values({
      name: "Demo Store",
      qrCodeUrl: "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=https://tapt.co.nz/pay/1",
      paymentUrl: `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000'}/pay/1`,
      currentProviderRate: "2.9000", // 2.9%
      ourRate: "0.2000", // 0.2%
    }).returning();

    console.log('Created demo merchant:', demoMerchant[0]);

    // Create demo user account
    await createUser('demo@tapt.co.nz', 'demo123', demoMerchant[0].id, 'merchant');
    console.log('Created demo user account');

    // No sample transactions - only show real transactions created by users

    console.log('Database seeding completed successfully');
  } catch (error) {
    console.error('Database seeding failed:', error);
    throw error;
  }
}

// Auto-seed if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase().catch(console.error);
}