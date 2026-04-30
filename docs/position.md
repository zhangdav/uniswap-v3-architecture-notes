---
id: position
title: 05 Position
sidebar_label: Position
---

import InlineMath from '@site/src/components/InlineMath';
import MathBlock from '@site/src/components/MathBlock';

## Overview

In the previous chapter, we analyzed the complete process of `swap` price progression:

- price moves continuously on the curve
- Liquidity changes discretely at ticks
- The entire process is driven by a while loop

This liquidity comes from the positions of all LPs. Therefore, if swap describes how prices move, then Position describes where liquidity comes from.

In V3, an LP does not simply "put money into the pool"; instead, it provides liquidity over a price range for a period of time. A Position can be abstracted as:

```

(liquidity, tickLower, tickUpper)

```

- `liquidity`: The amount of liquidity provided within this range
- `tickLower`: lower bound of the interval
- `tickUpper`: Upper bound of the interval

### 1. The relationship between Position and price

Whether a Position participates in a transaction depends only on whether the current price is within the range.

### Case 1: The price is within the range

![Diagram 20260427180001](/img/notes/pasted-image-20260427180001.png)

```

tickLower ≤ currentTick < tickUpper

```

at this time:

- The position provides liquidity
- It participates in the swap
- It can earn fees

---

### Case 2: Price is below the range

![Diagram 20260427180002](/img/notes/pasted-image-20260427180002.png)

```

currentTick < tickLower

```

at this time:

- The position does not participate in the swap
- The asset is fully represented as token0

---

### Case 3: Price is higher than the range

![Diagram 20260427180003](/img/notes/pasted-image-20260427180003.png)

```

currentTick ≥ tickUpper

```

at this time:

- The position does not participate in the swap
- The asset is fully represented as token1

### 2. How Position constitutes the liquidity of the pool

In V3, within a certain price range, the current effective liquidity equals the sum of the liquidity of all active positions. Therefore, swap does not interact with a single LP, but with the aggregated liquidity of all LPs in the current range.

When the swap price advances, a tick crossing occurs when the price reaches a tick, and liquidity changes as well. The corresponding code is `liquidity += liquidityNet`. In fact, `liquidityNet` comes from the position that starts or ends at this tick.

```

liquidityNet = Σ (liquidity changes for all Positions that start or end at this tick boundary)

```

So, in essence, a tick is the boundary of a position, `liquidityNet` is the liquidity change at that boundary, and swap moves the price across the liquidity formed by positions.

### 3. Open position: `mint`

The process of creating a position is actually to convert tokens into liquidity and bind that liquidity to a price range. The `mint` function in the NPM (Nonfungible Position Manager) contract does three things:

1. Determine the price range (tickLower / tickUpper)
2. Calculate liquidity based on current price and range
3. Transfer the corresponding amount of token0/token1

The actual process provides users with `amount0Desired/amount1Desired`, then calculates the maximum supported liquidity based on the current price and range, and then returns or leaves unused any excess tokens.

Therefore, in V3, liquidity is not provided directly, but is derived from amount0 / amount1, and different price positions correspond to different asset structures:

| Location | Assets Required |
| -------- | --------------- |
| The current price is within the range | token0 + token1 |
| Price is below range | Only token0 is needed |
| The price is above the range | Only token1 is needed |

For the specific calculation formula, please refer to section 4, "Calculation of Liquidity <InlineMath tex={String.raw`L`} />", in "01_Liquidity Mathematical Expressions".

### 4. Add position: `increaseLiquidity`

The essence is to add liquidity within the same price range.

- The interval `tickLower / tickUpper` remains unchanged
- Requires additional investment in tokens
- Mathematically, the new liquidity is still derived based on the current price <InlineMath tex={String.raw`P_c`} />, the range <InlineMath tex={String.raw`[P_A, P_B]`} /> and the new `amount0 / amount1`
- If the price is within the range, you need to consider the constraints on both sides of token0 / token1 at the same time, and finally choose the smaller liquidity that the two can support.
- If the price is outside the range, it will degenerate into a unilateral asset to increase liquidity.

In terms of contract implementation, `increaseLiquidity` first calls `LiquidityAmounts.getLiquidityForAmounts(...)` to calculate how much liquidity can be added based on the current price and input amount. Before increasing liquidity, the fees that have accumulated but have not yet been recorded in the current position are settled first, and then liquidity is updated and `pool.mint(...)` is called to complete the increase. For the calculation formula, see "01_Liquidity Mathematical Expressions" - section 4, "Calculation of Liquidity <InlineMath tex={String.raw`L`} />".

### 5. Reduce position: `decreaseLiquidity`

The opposite of adding a position is removing part of the liquidity from the current position.

- `liquidity` decreases
- The corresponding part of the token is released
- But it will not be automatically transferred to the user's wallet, so a subsequent call to `collect` is required.

Mathematically, it's still based on the same set of V3 liquidity formulas, just in the opposite direction:

- Add position: `amount0 / amount1 -> liquidity`
- Reduce position: `liquidity -> amount0 / amount1`

In terms of contract implementation, `decreaseLiquidity` directly calls `burn(...)` on the pool, and the core settles the `amount0 / amount1` corresponding to the liquidity removed based on the current price position and range. The calculation formula can be found in "01_Liquidity Mathematical Expressions" - section 4.2, "Calculating the Token Amounts from Liquidity".

It should be noted that fees must be calculated once when adding or reducing a position, because V3 fees are not collected automatically in real time. Instead, they are accounted for through the `feeGrowthInsideLastX128 + tokensOwed` snapshot-and-delayed-settlement method.

Therefore, when `increaseLiquidity`, `decreaseLiquidity`, or `collect` is called, the contract first performs fee settlement. Based on the current `feeGrowthInside`, it calculates the new fees accumulated since the last snapshot and adds them to `tokensOwed`. It then updates liquidity or processes withdrawals. Otherwise, fees earned by the old position would be lost, and newly added liquidity would incorrectly share historical fees.

However, these fees are not transferred out automatically; they must be claimed through a later `collect` operation. So how are these fees calculated and allocated precisely? How does `collect` transfer these benefits to users? That is the core topic of the next chapter.
