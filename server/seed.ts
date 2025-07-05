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
    // Check if merchants already exist
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
      paymentUrl: `${process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000'}/pay/1`,
      currentProviderRate: "2.9000", // 2.9%
      ourRate: "0.2000", // 0.2%
    }).returning();

    console.log('Created demo merchant:', demoMerchant[0]);

    // Create demo user account
    await createUser('demo@tapt.co.nz', 'demo123', demoMerchant[0].id, 'merchant');
    console.log('Created demo user account');

    // Create sample transactions
    const sampleTransactions = [
      {
        merchantId: demoMerchant[0].id,
        itemName: "Coffee & Muffin",
        price: "12.50",
        status: "completed",
        windcaveTransactionId: "TXN001",
      },
      {
        merchantId: demoMerchant[0].id,
        itemName: "Lunch Special",
        price: "18.90",
        status: "completed",
        windcaveTransactionId: "TXN002",
      },
      {
        merchantId: demoMerchant[0].id,
        itemName: "Gift Card",
        price: "50.00",
        status: "completed",
        windcaveTransactionId: "TXN003",
      },
      {
        merchantId: demoMerchant[0].id,
        itemName: "Book Purchase",
        price: "25.99",
        status: "failed",
        windcaveTransactionId: "TXN004",
      },
      {
        merchantId: demoMerchant[0].id,
        itemName: "Service Fee",
        price: "75.00",
        status: "pending",
        windcaveTransactionId: null,
      },
    ];

    for (const transaction of sampleTransactions) {
      await db.insert(transactions).values(transaction);
    }

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