---
id: oracle-and-twap
title: 08 Oracle and TWAP
sidebar_label: Oracle and TWAP
---

import InlineMath from '@site/src/components/InlineMath';
import MathBlock from '@site/src/components/MathBlock';

## Overview

On-chain, we need a price that is:

- Resistant to manipulation (not easily affected by flash loans)
- Reflects the true price over a period of time
- Does not rely on off-chain records

So time-weighted average prices are introduced:

<MathBlock tex={String.raw`\text{TWAP (Time Weighted Average Price)}`} />

V2's approach is to accumulate prices:

<MathBlock tex={String.raw`a(t) = a(t-1) + price \cdot \Delta t`} />

Query range price:

<MathBlock tex={String.raw`p(t_1,t_2) = \frac{a(t_2) - a(t_1)}{t_2 - t_1}`} />

The key improvement in V3 is that it no longer records price directly, but records:

<MathBlock tex={String.raw`tick = \log_{1.0001}(price)`} />

Therefore:

<MathBlock tex={String.raw`price = 1.0001^{tick}`} />

The essential change is to convert <InlineMath tex={String.raw`price \cdot \Delta t`} /> into <InlineMath tex={String.raw`tick \cdot \Delta t`} />.

using:

<MathBlock tex={String.raw`\log(p_1 \cdot p_2) = \log p_1 + \log p_2`} />

## 1. tickCumulative (core accumulator)

Definition:

<MathBlock tex={String.raw`tickCumulative(t) = \sum tick \cdot \Delta t`} />

Update method:

<MathBlock tex={String.raw`tickCumulative = tickCumulative + tick_{current} \cdot (t_{now} - t_{last})`} />

## 2. TWAP calculation

Given two points in time:

<MathBlock tex={String.raw`t_1,\quad t_2`} />

##### Step 1: Average tick

<MathBlock tex={String.raw`\bar{tick} = \frac{tickCumulative(t_2) - tickCumulative(t_1)}{t_2 - t_1}`} />

---

##### Step 2: Restore price

<MathBlock tex={String.raw`p(t_1,t_2) = 1.0001^{\bar{tick}}`} />

---

## 3. Why use tick(log)

Geometric mean

<MathBlock tex={String.raw`\log(p_1) + \log(p_2) = \log(p_1 \cdot p_2)`} />

Corresponding price relationship

<MathBlock tex={String.raw`price = 1.0001^{tick}`} />

## 4. Observation (historical snapshot)

V3 stores the state of multiple time points on-chain, and each record contains:

- timestamp
- tickCumulative
- secondsPerLiquidityCumulative

Each observation represents a snapshot of the accumulator at a point in time.

## 5. secondsPerLiquidity Oracle

definition:

<MathBlock tex={String.raw`secondsPerLiquidityCumulative = \sum \frac{\Delta t}{liquidity}`} />

Meaning:

Indicates the time during which one unit of liquidity participates in market making.

- The greater the liquidity → the less time it takes to distribute units
- The smaller the liquidity → the more time units will be allocated

## 6. Oracle query

Query two points in time:

<MathBlock tex={String.raw`t_1,\quad t_2`} />

calculate:

<MathBlock tex={String.raw`TWAP = \frac{tickCumulative(t_2) - tickCumulative(t_1)}{t_2 - t_1}`} />

A unified perspective with the fee system

Fee system:

<MathBlock tex={String.raw`f(i_{lower}, i_{upper}) = f_g - f_b - f_a`} />

Oracle system:

<MathBlock tex={String.raw`p(t_1,t_2) = \frac{\Delta tickCumulative}{\Delta t}`} />

Therefore, V2 and V3 are essentially unified, and both are expressed as:

<MathBlock tex={String.raw`value = cumulative(end) - cumulative(start)`} />

The difference is only in the dimensions:

- fee: make difference in tick space
- oracle: make differences in the time dimension

The essence of Oracle in V3 is:

- Time integration of tick (log price)
- Restore the average price through difference when querying

Finally got:

<MathBlock tex={String.raw`TWAP = \frac{\Delta tickCumulative}{\Delta t}`} />

Its core design is completely consistent with the fee system:

- Accumulator (cumulative)
- Interval difference (delta)

Just applied in different dimensions:

- fee → space (price range)
- oracle → time (time)
