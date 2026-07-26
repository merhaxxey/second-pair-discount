import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  Input,
  CartLine,
  CartLinesDiscountsGenerateRunResult,
} from '../generated/api';

type Config = {
  secondPct: number;
  thirdPct: number;
  maxDiscountedTier: number;
  requireEligibleTag: boolean;
};

const DEFAULT_CONFIG: Config = {
  secondPct: 20,
  thirdPct: 30,
  maxDiscountedTier: 3,
  requireEligibleTag: true,
};

type PairUnit = {
  frameLine: CartLine;
  addonLine: CartLine | null;
  effectivePrice: number;
};

function getAttr(line: CartLine, key: 'attribute' | 'frameRef'): string | null {
  const attr = (line as any)[key];
  return attr?.value ?? null;
}

function isEligible(line: CartLine, requireTag: boolean): boolean {
  if (!requireTag) return true;
  const product = (line.merchandise as any).product;
  const tagResults = product?.hasTags ?? [];
  return tagResults.some((t: any) => t.tag === 'pair-discount-eligible' && t.hasTag);
}

function buildPairUnits(lines: CartLine[], requireTag: boolean): PairUnit[] {
  const addonsByFrameToken = new Map<string, CartLine>();
  const nonAddonLines: CartLine[] = [];

  for (const line of lines) {
    const frameRef = getAttr(line, 'frameRef');
    if (frameRef) {
      addonsByFrameToken.set(frameRef, line);
    } else {
      nonAddonLines.push(line);
    }
  }

  const units: PairUnit[] = [];

  for (const line of nonAddonLines) {
    if (!isEligible(line, requireTag)) continue;

    const frameToken = getAttr(line, 'attribute');
    const addonLine = frameToken ? addonsByFrameToken.get(frameToken) ?? null : null;

    const framePrice = Number(line.cost.amountPerQuantity.amount);
    const addonPrice = addonLine ? Number(addonLine.cost.amountPerQuantity.amount) : 0;

    units.push({
      frameLine: line,
      addonLine,
      effectivePrice: framePrice + addonPrice,
    });
  }

  return units;
}

function expandAndRankUnits(pairUnits: PairUnit[]): PairUnit[] {
  const units: PairUnit[] = [];
  for (const pu of pairUnits) {
    for (let i = 0; i < pu.frameLine.quantity; i++) {
      units.push(pu);
    }
  }
  return units.sort((a, b) => a.effectivePrice - b.effectivePrice);
}

export function cartLinesDiscountsGenerateRun(
  input: Input,
): CartLinesDiscountsGenerateRunResult {
  if (!input.cart.lines.length) {
    return { operations: [] };
  }

  const hasProductDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Product,
  );

  if (!hasProductDiscountClass) {
    return { operations: [] };
  }

  let config: Config = DEFAULT_CONFIG;
  const raw = (input.discount as any).metafield?.value;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      config = {
        secondPct: Number(parsed.secondPct ?? DEFAULT_CONFIG.secondPct),
        thirdPct: Number(parsed.thirdPct ?? DEFAULT_CONFIG.thirdPct),
        maxDiscountedTier: Number(
          parsed.maxDiscountedTier ?? DEFAULT_CONFIG.maxDiscountedTier,
        ),
        requireEligibleTag:
          parsed.requireEligibleTag ?? DEFAULT_CONFIG.requireEligibleTag,
      };
    } catch (e) {
      config = DEFAULT_CONFIG;
    }
  }

  const pairUnits = buildPairUnits(input.cart.lines as CartLine[], config.requireEligibleTag);
  const ranked = expandAndRankUnits(pairUnits);

  const candidates: any[] = [];

  const tiers: { index: number; pct: number; message: string }[] = [
    { index: 1, pct: config.secondPct, message: `${config.secondPct}% off your second pair` },
    { index: 2, pct: config.thirdPct, message: `${config.thirdPct}% off your third pair` },
  ];

  for (const tier of tiers) {
    if (tier.index + 1 > config.maxDiscountedTier) continue;
    if (ranked.length <= tier.index) continue;

    const unit = ranked[tier.index];
    const seenLineIds = new Set<string>();

    if (!seenLineIds.has(unit.frameLine.id)) {
      candidates.push({
        message: tier.message,
        targets: [{ cartLine: { id: unit.frameLine.id } }],
        value: { percentage: { value: tier.pct } },
      });
      seenLineIds.add(unit.frameLine.id);
    }

    if (unit.addonLine && !seenLineIds.has(unit.addonLine.id)) {
      candidates.push({
        message: tier.message,
        targets: [{ cartLine: { id: unit.addonLine.id } }],
        value: { percentage: { value: tier.pct } },
      });
      seenLineIds.add(unit.addonLine.id);
    }
  }

  if (!candidates.length) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}