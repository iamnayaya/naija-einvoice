import { PARSER_CORPUS } from './corpus';
import { parseMessage } from './index';
import type { ParseResult } from './types';

const pad = (value: string, width: number) => value.padEnd(width).slice(0, width);

function summarize(result: ParseResult): string {
  const sales = result.sales?.length ? ` (${result.sales.length} sales)` : '';
  switch (result.status) {
    case 'parsed':
      return `${result.fields.itemDescription ?? '?'} | ₦${result.fields.amount ?? '?'} | qty ${result.fields.quantity ?? 1}${
        result.fields.customerName ? ` | to ${result.fields.customerName}` : ''
      }${sales}`;
    case 'clarify':
      return `NEED: ${result.askFor ?? '?'}${result.fields.amount ? ` (has amount ₦${result.fields.amount})` : ''}${
        result.fields.itemDescription ? ` (has item "${result.fields.itemDescription}")` : ''
      }`;
    case 'correction':
      return `CORRECTED amount → ₦${result.fields.amount}`;
    case 'affirmation':
      return 'affirmative reply';
    case 'negation':
      return 'negative reply';
    case 'unparseable':
      return 'unparseable';
  }
}

async function main() {
  console.log(
    [
      pad('id', 8),
      pad('lang', 6),
      pad('status', 13),
      'extraction / bot action',
      '\n' + '-'.repeat(100),
    ].join(''),
  );

  for (const c of PARSER_CORPUS) {
    const result = await parseMessage(c.raw);
    console.log(
      [
        pad(c.id, 8),
        pad(result.language, 6),
        pad(result.status, 13),
        `"${c.raw}"  ->  ${summarize(result)}`,
      ].join(''),
    );
  }
}

void main();
