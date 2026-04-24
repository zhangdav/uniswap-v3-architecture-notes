---
id: position
title: 05 Position
sidebar_label: 05 Position
---

import InlineMath from '@site/src/components/InlineMath';
import MathBlock from '@site/src/components/MathBlock';

## Overview

In the previous chapter, we have analyzed the complete process of `swap` price advancement:

- price moves continuously on the curve
- Liquidity changes discretely at ticks
- The entire process is driven by a while loop

This liquidity comes from the Position of all LPs. Therefore, if swap describes "how prices move", then Position describes "where liquidity comes from".

In V3, an LP does not "put money into the pool", but provides a period of liquidity in a price range. A Position can be abstracted as:

```

(liquidity, tickLower, tickUpper)

```

- `liquidity`: The intensity of liquidity provided within this range
- `tickLower`: lower bound of the interval
- `tickUpper`: Upper bound of the interval

### 1. The relationship between Position and price

Whether a Position participates in a transaction only depends on whether the current price is within the range.

TODO: Supplementary pictures

### Case 1: The price is within the range

```

tickLower ≤ currentTick < tickUpper

```

at this time:

- Position provides liquidity
- Participate in swap
- You can earn fees

---

### Case 2: Price is below the range

```

currentTick < tickLower

```

at this time:

- Position does not participate in swap
- The asset is fully represented as token0

---

### Case 3: Price is higher than range

```

currentTick ≥ tickUpper

```

at this time:

- Position does not participate in swap
- The asset is fully represented as token1

### 2. How Position constitutes the liquidity of the pool

In V3, within a certain price range, the current effective liquidity = the sum of the liquidity of all active positions. Therefore, swap does not interact with a certain LP, but with the "aggregated liquidity of all LPs in the current range".

When the swap price advances in the previous chapter, a crossing tick will occur when the price reaches the tick, and then liquidity will also change. The corresponding code is `liquidity += liquidityNet`. In fact, `liquidityNet` here comes from the Position that starts or ends on this tick.

```

liquidityNet = Σ (liquidity changes for all Positions that start or end at this tick boundary)

```

So essentially tick is the boundary of Position, `liquidityNet` is the change in and out of Position, and swap moves the price on the liquidity composed of Position.

### 3. Open position: `mint`

The process of creating a position is actually to convert the token into liquidity and bind it to a price range. The `mint` function in the NPM contract does three things:

1. Determine the price range (tickLower / tickUpper)
2. Calculate liquidity based on current price and range
3. Transfer the corresponding amount of token0/token1

The actual process provides users with `amount0Desired/amount1Desired`, then calculates the "maximum supported liquidity" based on the current price and range, and then returns the excess tokens or does not use them.

Therefore, in V3, liquidity is not input directly, but is derived from amount0 / amount1, and different price positions correspond to different asset structures:

| Location | Assets Required |
| -------- | --------------- |
| The current price is within the range | token0 + token1 |
| Price is below range | Only token0 is needed |
| The price is above the range | Only token1 is needed |

For the specific calculation formula, please refer to section 4. Calculation of Liquidity <InlineMath tex={String.raw`L`} /> in "01_Liquidity Mathematical Expression".

### 4. Add position: `increaseLiquidity`

The essence is to add liquidity within the same price range.

- The interval `tickLower / tickUpper` remains unchanged
- Requires additional investment in tokens
- Mathematically, the new liquidity is still derived based on the current price <InlineMath tex={String.raw`P_c`} />, the range <InlineMath tex={String.raw`[P_A, P_B]`} /> and the new `amount0 / amount1`
- If the price is within the range, you need to consider the constraints on both sides of token0 / token1 at the same time, and finally choose the smaller liquidity that the two can support.
- If the price is outside the range, it will degenerate into a unilateral asset to increase liquidity.

In terms of contract implementation, `increaseLiquidity` will first pass `LiquidityAmounts.getLiquidityForAmounts(...)`
Calculate the liquidity that can be added this time based on the current price and input quantity. Before increasing liquidity, the fees that have been accumulated but not yet recorded in the current position will be settled first, and then the liquidity is updated and `pool.mint(...)` is called to complete the position increase. Calculation formula reference: "01_Liquidity Mathematical Expression" - 4. Calculation of liquidity <InlineMath tex={String.raw`L`} />.

### 5. Reduce position: `decreaseLiquidity`

The opposite of adding a position is to remove a portion of liquidity from the current position.

- `liquidity` decrease
- The corresponding part of the token is released
- But it will not be automatically transferred to the user's wallet, and subsequent calls to `collect` are required.

Mathematically, it's still based on the same set of V3 liquidity formulas, just in the opposite direction:

- Add position: `amount0 / amount1 -> liquidity`
- Reduce position: `liquidity -> amount0 / amount1`

In terms of contract implementation, `decreaseLiquidity` directly calls `burn(...)` of the pool, and the core settles the `amount0 / amount1` corresponding to the liquidity removed this time based on the current price position and range. The calculation formula can be found in "01_Liquidity Mathematical Expressions" - 4.2 Calculating the Token quantity by Liquidity.

It should be noted that the fee must be calculated once when adding or reducing a position, because the V3 fee is not automatically collected in real time, but is accounted for through the `feeGrowthInsideLastX128 + tokensOwed` "snapshot + delayed settlement" method.

Therefore, when the following `increaseLiquidity`, `decreaseLiquidity`, and `collect` operations occur, the contract will first perform a "fee settlement", that is, based on the current feeGrowthInside, the new fees since the last snapshot will be calculated and accumulated in tokensOwed. Then update liquidity or perform withdrawals. Otherwise, the fees earned by the old position will be lost, and the new liquidity will incorrectly participate in sharing the historical fees.

However, these fees will not be transferred out automatically, but will need to be extracted through subsequent collect operations. So how are these fees accurately calculated and allocated? How does collect transfer these benefits to users? This is the core of the discussion in the next chapter.
