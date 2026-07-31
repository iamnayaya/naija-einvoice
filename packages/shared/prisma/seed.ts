import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { prisma } from '../src/db/prisma';
import type { PreferredLanguage, SubscriptionTier } from '@prisma/client';

loadEnv({ path: resolve(import.meta.dirname, '../../../.env') });

interface SeedMerchant {
  businessName: string;
  phone: string;
  tin: string | null;
  state: string;
  preferredLanguage: PreferredLanguage;
  subscriptionTier: SubscriptionTier;
}

const seedMerchants: SeedMerchant[] = [
  {
    businessName: "Amina's Beauty Hub",
    phone: '2348012345678',
    tin: null,
    state: 'Kano',
    preferredLanguage: 'ha',
    subscriptionTier: 'free',
  },
  {
    businessName: 'Okafor Electronics',
    phone: '2348023456789',
    tin: '01123456-0001',
    state: 'Lagos',
    preferredLanguage: 'ig',
    subscriptionTier: 'starter',
  },
  {
    businessName: 'Folake Foods',
    phone: '2348034567890',
    tin: null,
    state: 'Lagos',
    preferredLanguage: 'yo',
    subscriptionTier: 'growth',
  },
  {
    businessName: 'Nwosu Grocery Mart',
    phone: '2348045678901',
    tin: null,
    state: 'Lagos',
    preferredLanguage: 'ig',
    subscriptionTier: 'free',
  },
  {
    businessName: 'Halima Tailoring',
    phone: '2348056789012',
    tin: null,
    state: 'Kano',
    preferredLanguage: 'ha',
    subscriptionTier: 'free',
  },
];

async function main() {
  const agent = await prisma.agent.upsert({
    where: { phone: '2348090000000' },
    update: {},
    create: {
      name: 'Khadija Suleiman',
      phone: '2348090000000',
      momoAccountForPayout: '09090000000',
      revenueShareRate: 0.05,
    },
  });
  console.log(`Agent ready: ${agent.name} (${agent.id})`);

  for (const m of seedMerchants) {
    const merchant = await prisma.merchant.upsert({
      where: { phone: m.phone },
      update: m,
      create: {
        ...m,
        onboardedByAgentId: agent.id,
      },
    });
    console.log(`Merchant ready: ${merchant.businessName} (${merchant.preferredLanguage}, ${merchant.state})`);
  }

  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
