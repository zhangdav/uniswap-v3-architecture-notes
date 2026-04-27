---
id: position-fee-settlement
title: 07 Position Fee Settlement
sidebar_label: 07 Position Fee Settlement
---

import InlineMath from '@site/src/components/InlineMath';
import MathBlock from '@site/src/components/MathBlock';

## Overview

In the previous chapter, we derived:

<MathBlock tex={String.raw`f_{\text{inside}} = f_g - f_b(i_l) - f_a(i_u)`} />

This gives us a unified expression for the accumulated fees within an interval. However, one key question remains: how are LP gains recorded and settled in the contract?

### 1. Core question: Why can’t fees be allocated in real time?

In V2:

- All liquidity is global
- Fees go directly into the pool reserves
- LPs earn fees through their share of the pool

But in V3:

- Liquidity is split across price intervals
- Different LPs participate in swaps at different times
- Fees cannot be allocated on a tranche-by-tranche basis

If every LP had to be updated for every swap, gas usage would explode.

### 2. The core idea of V3: Lazy Settlement

V3 does not allocate fees to LPs for each swap. Instead, it accumulates them first and settles them later.

Each position will be recorded:

```solidity

feeGrowthInside0LastX128
feeGrowthInside1LastX128

tokensOwed0
tokensOwed1

```

When an LP creates or updates a position, it stores:

<MathBlock tex={String.raw`f_{\text{entry}} = f_{\text{inside}} \ \text{at entry}`} />

Stored as:

<MathBlock tex={String.raw`f_{\text{last}}`} />

Current moment:

<MathBlock tex={String.raw`f_{\text{now}} = \text{feeGrowth inside the current range}`} />

Revenue calculation:

<MathBlock tex={String.raw`\Delta f = f_{\text{now}} - f_{\text{last}}`} />

From `feeGrowth` to real income

<MathBlock tex={String.raw`f_g = \sum \frac{f_i}{L_i}`} />

It represents the return per unit of liquidity. Therefore, the actual LP return is:

<MathBlock tex={String.raw`\text{tokensOwed} = L \cdot (f_{\text{now}} - f_{\text{last}})`} />

Where:

- <InlineMath tex={String.raw`L`} /> = LP liquidity
- <InlineMath tex={String.raw`f_{\text{now}}`} /> = accumulated fee within the current range
- <InlineMath tex={String.raw`f_{\text{last}}`} /> = snapshot from the last settlement

Core formula:

<MathBlock tex={String.raw`\text{tokensOwed} += L \cdot \left( f_{\text{inside, now}} - f_{\text{inside, last}} \right)`} />

### 3. When is settlement triggered?

V3 does not automatically send funds. Settlement is triggered only when the following operations are performed:

##### 1. `mint` (open position)

- Initialize the position
- Record the initial snapshot:

<MathBlock tex={String.raw`f_{\text{last}} = f_{\text{inside}}`} />

##### 2. `increaseLiquidity` (increase position)

Fees must be settled before adding liquidity:

<MathBlock tex={String.raw`\text{tokensOwed} += L \cdot \left( f_{\text{inside, now}} - f_{\text{inside, last}} \right)`} />

Then update:

<MathBlock tex={String.raw`f_{\text{last}} = f_{\text{inside}}`} />

Then update `f_last = f_inside`. Newly added liquidity should not receive historical returns.

##### 3. `decreaseLiquidity` (reduce position)

Same idea:

- Settle the old income first
- Then reduce liquidity

##### 4. `collect` (receive proceeds)

`collect` does not calculate returns. It only does one thing: `transfer(tokensOwed)` and then set `tokensOwed = 0`.

##### Example:

> Assumptions:
>
> LP provides liquidity: `S = 100`
> Initial:

> <MathBlock tex={String.raw`f_{\text{last}} = 10`} />
>
> Unit: token / liquidity

> After some time:

> <MathBlock tex={String.raw`f_{\text{now}} = 15`} />

> Then:

> <MathBlock tex={String.raw`\Delta f = 5`} />

> means that each unit of liquidity earns 5 more tokens, so the total income is:
>

> <MathBlock tex={String.raw`\text{tokensOwed} = 100 \cdot 5 = 500`} />

Note: In the real Uniswap V3 contract, `feeGrowthInsideX128` is actually:

> <MathBlock tex={String.raw`\text{feeGrowthInsideX128} = f \cdot 2^{128}`} />

LP income calculation, using the real on-chain formula:

> <MathBlock tex={String.raw`\text{tokensOwed} = L \cdot \frac{f_{\text{inside, now}} - f_{\text{inside, last}}}{2^{128}}`} />

Note: `f` here represents the cumulative income per unit of liquidity (`fee / liquidity`), not the actual number of tokens.
