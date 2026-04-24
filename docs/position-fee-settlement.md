---
id: position-fee-settlement
title: 07 Position Fee Settlement
sidebar_label: 07 Position Fee Settlement
---

import InlineMath from '@site/src/components/InlineMath';
import MathBlock from '@site/src/components/MathBlock';

## Overview

In the previous chapter we have derived:

<MathBlock tex={String.raw`f_{\text{inside}} = f_g - f_b(i_l) - f_a(i_u)`} />

And a unified expression method for the accumulated fees within the interval is obtained. However, a key question remains unresolved here: how are LP gains recorded and settled in the contract?

### 1. Core question: Why can’t fees be allocated in real time?

In V2:

- All liquidity is global
- fee directly enters the pool reserve
- LP is automatically held through share

But in V3:

- Liquidity is inter-partitioned
- Different LPs participate in swap at different times
- Unable to allocate on a tranche basis

If gas is given to each LP for every swap, it will explode.

### 2. The core idea of ​​V3: Lazy Settlement

V3 does not allocate fees to LP for each swap, but instead accumulates them first and then settles them.

Each position will be recorded:

```solidity

feeGrowthInside0LastX128
feeGrowthInside1LastX128

tokensOwed0
tokensOwed1

```

When an LP creates or updates a position, it is logged:

<MathBlock tex={String.raw`f_{\text{entry}} = f_{\text{inside}} \ \text{at entry}`} />

Recorded as:

<MathBlock tex={String.raw`f_{\text{last}}`} />

current moment

<MathBlock tex={String.raw`f_{\text{now}} = \text{feeGrowth inside the current range}`} />

Revenue calculation

<MathBlock tex={String.raw`\Delta f = f_{\text{now}} - f_{\text{last}}`} />

From feeGrowth to real income

<MathBlock tex={String.raw`f_g = \sum \frac{f_i}{L_i}`} />

It represents the return per unit of liquidity. Therefore, the actual return of LP is:

<MathBlock tex={String.raw`\text{tokensOwed} = L \cdot (f_{\text{now}} - f_{\text{last}})`} />

in:

- <InlineMath tex={String.raw`L`} /> = LP’s liquidity
- <InlineMath tex={String.raw`f_{\text{now}}`} /> = Accumulated fee within the current range
- <InlineMath tex={String.raw`f_{\text{last}}`} /> = Snapshot from last settlement

Core formula:

<MathBlock tex={String.raw`\text{tokensOwed} += L \cdot \left( f_{\text{inside, now}} - f_{\text{inside, last}} \right)`} />

### 3. When will settlement be made?

V3 will not automatically send money, it will only be triggered when the following operations are performed:

##### 1. mint (open position)

- initialize position
- Record initial snapshot:

<MathBlock tex={String.raw`f_{\text{last}} = f_{\text{inside}}`} />

##### 2. increaseLiquidity (increase position)

You must settle before adding a position:

<MathBlock tex={String.raw`\text{tokensOwed} += L \cdot \left( f_{\text{inside, now}} - f_{\text{inside, last}} \right)`} />

Then update:

<MathBlock tex={String.raw`f_{\text{last}} = f_{\text{inside}}`} />

Add more liquidity, because the newly added liquidity should not receive historical returns.

##### 3. decreaseLiquidity (reduce position)

same:

-Settlement of old income first
- Reduce liquidity again

##### 4. collect (receive proceeds)

collect doesn't calculate returns, it just does one thing: `transfer(tokensOwed)` and then `tokensOwed = 0`.

##### For example🌰:

> Assumptions:
>
> LP provides liquidity: S = 100
>Initial:

> <MathBlock tex={String.raw`f_{\text{last}} = 10`} />
>
> Unit: token/liquidity

> After some time:

> <MathBlock tex={String.raw`f_{\text{now}} = 15`} />

> Then:

> <MathBlock tex={String.raw`\Delta f = 5`} />

> means that each unit of liquidity earns 5 more tokens, so the total income is:
>

> <MathBlock tex={String.raw`\text{tokensOwed} = 100 \cdot 5 = 500`} />

Note: In the real Uniswap V3 contract: `feeGrowthInsideX128` is actually:

> <MathBlock tex={String.raw`\text{feeGrowthInsideX128} = f \cdot 2^{128}`} />

LP income calculation (real formula on the chain):

> <MathBlock tex={String.raw`\text{tokensOwed} = L \cdot \frac{f_{\text{inside, now}} - f_{\text{inside, last}}}{2^{128}}`} />

Note: f here represents the cumulative income per unit of liquidity (fee/liquidity), not the actual number of tokens.
