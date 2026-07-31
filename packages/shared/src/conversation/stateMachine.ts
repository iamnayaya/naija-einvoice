import type { Prisma, PrismaClient } from '@prisma/client';
import type { ConversationPhase, PreferredLanguage } from '../domain/enums';
import { t } from '../i18n';
import { parseMessage, type Tier2Llm } from '../parser';
import { decideTurn, type TurnDecision } from './decide';
import type { WhatsAppSender } from './sender';
import { emptyContext, type ConversationContext } from './types';

/**
 * Conversation engine orchestrator.
 *
 * Takes one inbound WhatsApp message from a merchant, runs it through the
 * parser (Tier 1 + optional Tier 2 fallback), applies the pure transition
 * logic (decide.ts), persists the ConversationState row, performs any side
 * action (creating Transactions + enqueueing BullMQ jobs on confirmation),
 * renders a localized reply, and sends it through the injectable
 * `WhatsAppSender`. Every state transition is logged with enough context to
 * reconstruct why the bot replied the way it did.
 */

export interface TransitionEvent {
  merchantId: string;
  whatsappThreadId: string;
  from: ConversationPhase;
  to: ConversationPhase;
  raw: string;
  parsedStatus: string;
  parsedTier: string;
  reply: string;
  createdAt: Date;
}

export type TransitionLogger = (event: TransitionEvent) => void;

const defaultTransitionLogger: TransitionLogger = (event) => {
  console.log(`[conversation:transition] ${JSON.stringify(event)}`);
};

export interface ConversationDeps {
  prisma: PrismaClient;
  sender: WhatsAppSender;
  /** Called with the created transaction ids once a sale is confirmed. */
  enqueue: (opts: { transactionIds: string[]; threadId: string }) => Promise<void>;
  /** Optional Tier 2 LLM fallback for the parser. */
  llm?: Tier2Llm;
  logTransition?: TransitionLogger;
}

export interface IncomingMessage {
  merchantId: string;
  whatsappThreadId: string;
  text: string;
  preferredLanguage: PreferredLanguage;
}

export interface HandleResult {
  state: ConversationPhase;
  reply: string;
  createdTransactionIds: string[];
  context: ConversationContext;
}

export async function handleIncomingMessage(
  deps: ConversationDeps,
  message: IncomingMessage,
): Promise<HandleResult> {
  const db = deps.prisma;
  const logger = deps.logTransition ?? defaultTransitionLogger;

  const existing = await db.conversationState.upsert({
    where: { whatsappThreadId: message.whatsappThreadId },
    create: {
      merchantId: message.merchantId,
      whatsappThreadId: message.whatsappThreadId,
      state: 'awaiting_details',
      context: emptyContext() as unknown as Prisma.InputJsonValue,
    },
    update: {},
  });

  const context = (existing.context ?? emptyContext()) as ConversationContext;
  const parsed = await parseMessage(message.text, { llm: deps.llm });
  const decision = decideTurn({
    state: existing.state,
    context,
    parsed,
    language: message.preferredLanguage,
  });

  const createdTransactionIds: string[] = [];
  try {
    if (decision.action === 'enqueue' && decision.salesToEnqueue && decision.salesToEnqueue.length > 0) {
      // One Transaction per confirmed sale. The enqueue call happens after all
      // rows exist so a partial failure never leaves an orphaned job.
      for (const sale of decision.salesToEnqueue) {
        if (!sale.amount) continue;
        const transaction = await db.transaction.create({
          data: {
            merchantId: message.merchantId,
            amount: sale.amount,
            customerRef: sale.customerName,
            source: 'whatsapp',
            rawPayload: {
              text: message.text,
              threadId: message.whatsappThreadId,
              parsedStatus: parsed.status,
              itemDescription: sale.itemDescription,
              quantity: sale.quantity,
            },
          },
        });
        createdTransactionIds.push(transaction.id);
      }
      if (createdTransactionIds.length > 0) {
        await deps.enqueue({ transactionIds: createdTransactionIds, threadId: message.whatsappThreadId });
      }
    }

    await db.conversationState.update({
      where: { id: existing.id },
      data: { state: decision.nextState, context: decision.nextContext as unknown as Prisma.InputJsonValue },
    });

    const reply = renderReply(message.preferredLanguage, decision);
    await deps.sender.sendText(message.whatsappThreadId, reply);

    logger({
      merchantId: message.merchantId,
      whatsappThreadId: message.whatsappThreadId,
      from: existing.state,
      to: decision.nextState,
      raw: message.text,
      parsedStatus: parsed.status,
      parsedTier: parsed.tier,
      reply,
      createdAt: new Date(),
    });

    return {
      state: decision.nextState,
      reply,
      createdTransactionIds,
      context: decision.nextContext,
    };
  } catch (err) {
    // Never leave the merchant hanging on an internal error.
    await deps.sender
      .sendText(message.whatsappThreadId, t(message.preferredLanguage, 'error'))
      .catch(() => undefined);
    throw err;
  }
}

function renderReply(language: PreferredLanguage, decision: TurnDecision): string {
  return t(language, decision.replyKey, decision.replyParams);
}
