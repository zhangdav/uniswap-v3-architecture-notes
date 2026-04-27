---
id: tick-and-sqrt-price-x96
title: 02 Tick and sqrtPriceX96
sidebar_label: 02 Tick and sqrtPriceX96
---

import InlineMath from '@site/src/components/InlineMath';
import MathBlock from '@site/src/components/MathBlock';

## Overview

In Uniswap V3, price is no longer determined directly by the reserve ratio as in V2. Instead, it is represented on two levels: the discrete index `tick` and the precise on-chain value `sqrtPriceX96`.

This design allows prices to be indexed efficiently for range liquidity management and calculated with high precision on-chain.

This chapter will focus on these two representations and elaborate on three core issues:

1. Why use tick to represent prices
2. How tickSpacing controls price precision and system complexity
3. Why the actual price stored on-chain is `sqrtPriceX96`, not `price` or `tick`

Through this chapter, we will establish a complete price representation system:

<MathBlock tex={String.raw`\text{price} \leftrightarrow \text{tick} \leftrightarrow \text{sqrtPriceX96}`} />

This lays the foundation for understanding liquidity calculations, as well as subsequent swap processes and cross-tick behavior.

## 1. Tick

In Uniswap V2, the price is directly determined by the reserve:

<MathBlock tex={String.raw`P = \frac{y}{x}`} />

in:

- <InlineMath tex={String.raw`x`} />: token0 reserve
- <InlineMath tex={String.raw`y`} />: token1 reserve

At the same time, a constant product is satisfied:

<MathBlock tex={String.raw`x \cdot y = k`} />

This method of equating price with the reserve ratio is very simple, and prices and reserves can change continuously. However, it cannot manage prices discretely, cannot efficiently manage interval liquidity, and cannot perform interval indexing on-chain.

To solve these problems, `tick` was introduced in V3 so that price is no longer represented as a continuous reserve ratio, but as a discretized index:

<MathBlock tex={String.raw`P = 1.0001^{\text{tick}}`} />

```python

tick = -200697
p = 1.0001 ** tick

# token0 = ETH (18 decimals)
decimals_0 = 1e18

# token1 = USDC (6 decimals)
decimals_1 = 1e6

price = p * decimals_0 / decimals_1
print(price)

```

Output result:

<MathBlock tex={String.raw`P_{\text{real}} \approx 1924.31`} />

Represents 1 ETH ≈ 1924 USDC

This method allows each `tick` to correspond to a price, and `tick` is the logarithmic representation of the price. In this way, prices are linear in log space.

<MathBlock tex={String.raw`\text{tick} = \log_{1.0001}(P)`} />

So the essence of `tick` is the integer index of price in logarithmic space. Introducing `tick` allows prices to be indexed discretely, liquidity to be stored in intervals, and bitmaps to be used for efficient searches.

From V2 to V3, an essential change is:

- V2: price = reserve ratio (continuous space)
- V3: price = tick index (discrete space)

## 2. TickSpacing

In Uniswap V3, not all ticks can be used. `tickSpacing` is the step constraint on ticks and determines which ticks are available.

<MathBlock tex={String.raw`tick \in \{ ..., -2s, -s, 0, s, 2s, ... \}`} />

Where: s = tickSpacing

For example when tickSpacing = 2:

![Diagram 20260403095909](/img/notes/pasted-image-20260403095909.png)

Only the green dotted-line ticks can be initialized with liquidity; other ticks are not allowed. So `tickSpacing` is essentially a control over the discrete precision of prices.

In the contract, tickSpacing directly determines the total number of ticks in the system:

<MathBlock tex={String.raw`\text{numTicks} = \frac{\text{maxTick} - \text{minTick}}{\text{tickSpacing}} + 1`} />

The smaller `tickSpacing` is:

- The ticks are denser
- The larger the numTicks
- The greater the number of states
- The higher the gas cost

The larger `tickSpacing` is:

- The ticks are sparser
- The smaller the numTicks
- The lower the gas cost

Therefore:

The essence of `tickSpacing` is to make a trade-off between:

- Accuracy (price granularity)
- gas cost (state size)

In Uniswap V3, `tickSpacing` is determined by the fee tier, is fixed when the pool is created, and cannot be modified.

| Fee Tier | TickSpacing |
|----------|------------|
| 0.01%    | 1          |
| 0.05%    | 10         |
| 0.3%     | 60         |
| 1%       | 200        |

When creating pools of different currency pairs, tickSpacing is not directly selected, but tickSpacing is determined indirectly by selecting fee tier. The binding of tickSpacing and fee tier is essentially a design trade-off:

- Low fee → High accuracy (small tickSpacing)
- High fees → low precision (big tickSpacing)

> For example:
>
> 1. Low volatility assets (such as stablecoin)
>
> - Small price fluctuations
> - Need higher precision
> - LP needs lower income compensation
> - Use small tickSpacing
>
>
> 2. Highly volatile assets (such as ETH/USDC)
>
> - High price fluctuations
> - Low accuracy requirements
> - LP needs higher income compensation
> - Use big tickSpacing

## 3. sqrtPriceX96

We already know before:

<MathBlock tex={String.raw`P = 1.0001^{\text{tick}}`} />

But in the actual contract, Uniswap V3 does not directly store floating-point `price` values. Because Solidity does not support floating-point numbers, it uses integers to represent prices. <InlineMath tex={String.raw`Q96 = 2^{96}`} /> is a fixed-point scaling factor:

<MathBlock tex={String.raw`\text{sqrtPriceX96} = \sqrt{P} \cdot 2^{96}`} />

This maintains high accuracy within the integer range, and price can also be derived from `sqrtPriceX96`:

<MathBlock tex={String.raw`P = \left(\frac{\text{sqrtPriceX96}}{2^{96}}\right)^2`} />

```python

sqrt_price_x_96 = 3443439269043970780644209
q = 2 ** 96

p = (sqrt_price_x_96 / q) ** 2

# token0 = ETH
decimals_0 = 1e18

# token1 = USDC
decimals_1 = 1e6

price = p * decimals_0 / decimals_1
print(price)

```

Output result:

<MathBlock tex={String.raw`P_{\text{real}} \approx 1888.97`} />

So we can get:

<MathBlock tex={String.raw`\text{tick} = \frac{2 \cdot \log\left(\frac{\text{sqrtPriceX96}}{2^{96}}\right)}{\log(1.0001)}`} />

So we already know that `tick` is the discrete index of the price for range positioning, and `sqrtPriceX96` is the true representation of the price for calculation.
