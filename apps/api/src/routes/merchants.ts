import { Router } from 'express';
import { prisma, preferredLanguageSchema, subscriptionTierSchema } from '@naija/shared';
import { z } from 'zod';

export const merchantsRouter = Router();

const createMerchantSchema = z.object({
  businessName: z.string().min(1),
  phone: z.string().min(1),
  tin: z.string().nullable().optional(),
  state: z.string().min(1),
  preferredLanguage: preferredLanguageSchema,
  subscriptionTier: subscriptionTierSchema.optional(),
  onboardedByAgentId: z.string().optional(),
});

merchantsRouter.get('/merchants', async (_req, res) => {
  try {
    const merchants = await prisma.merchant.findMany({
      include: { _count: { select: { transactions: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ merchants });
  } catch (err) {
    console.error('[merchants] list failed:', err);
    res.status(500).json({ error: 'list failed' });
  }
});

merchantsRouter.get('/merchants/:id', async (req, res) => {
  try {
    const merchant = await prisma.merchant.findUnique({
      where: { id: req.params.id },
      include: { transactions: true, onboardedByAgent: true },
    });
    if (!merchant) {
      res.status(404).json({ error: 'merchant not found' });
      return;
    }
    res.json({ merchant });
  } catch (err) {
    console.error('[merchants] get failed:', err);
    res.status(500).json({ error: 'get failed' });
  }
});

merchantsRouter.post('/merchants', async (req, res) => {
  const parsed = createMerchantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid merchant', details: parsed.error.flatten() });
    return;
  }
  try {
    const merchant = await prisma.merchant.create({ data: parsed.data });
    res.status(201).json({ merchant });
  } catch (err) {
    console.error('[merchants] create failed:', err);
    res.status(500).json({ error: 'create failed' });
  }
});
