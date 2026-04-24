---
id: tick-and-sqrt-price-x96
title: 02 Tick 与 sqrtPriceX96 的关系
sidebar_label: 02 Tick 与 sqrtPriceX96 的关系
---

import InlineMath from '@site/src/components/InlineMath';
import MathBlock from '@site/src/components/MathBlock';

## 概述

在 Uniswap V3 中，价格不再像 V2 一样由储备比直接决定，而是被拆分为两层表示，一层用于离散索引 `tick`，另一层用于精确计算`sqrtPriceX96`。

这种设计让价格既可以被高效索引（用于区间流动性管理），又可以在链上进行高精度计算。

本章将围绕这两种表示展开，阐述三个核心问题：

1. 为什么需要用 tick 来表示价格（离散化）
2. tickSpacing 如何控制价格精度与系统复杂度
3. 为什么链上实际存储的价格是 sqrtPriceX96，而不是 price 或 tick

通过这一章，我们将建立起完整的价格表示体系：

<MathBlock tex={String.raw`\text{price} \leftrightarrow \text{tick} \leftrightarrow \text{sqrtPriceX96}`} />

为理解流动性计算、以及后续 swap 过程和跨 tick 行为打下基础。

## 1. Tick

在 Uniswap V2 中，价格由储备直接决定：

<MathBlock tex={String.raw`P = \frac{y}{x}`} />

其中：

- <InlineMath tex={String.raw`x`} />：token0 储备
- <InlineMath tex={String.raw`y`} />：token1 储备

同时满足恒定乘积：

<MathBlock tex={String.raw`x \cdot y = k`} />

这种价格等于储备比的方式非常简单，而且价格与储备可以连续变化。但它无法离散管理价格，也无法高效管理区间流动性，也无法在链上做区间索引。

为了解决以上问题，V3 中引入了 `tick` 让价格不再是连续储备，而是离散化索引：

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

输出结果：

<MathBlock tex={String.raw`P_{\text{real}} \approx 1924.31`} />

表示 1 ETH ≈ 1924 USDC

这种方式让每个 `tick` 对应一个价格，`tick`是价格的 `log` 表示（指数坐标）。这样价格在 `log` 空间是线性的。

<MathBlock tex={String.raw`\text{tick} = \log_{1.0001}(P)`} />

所以 `tick` 的本质是价格在对数空间中的整数索引。`tick` 的引入使得价格可以被离散索引，liquidity 可以按区间存储，也可以使用 bitmap 做高效查找。

从 V2 到 V3，一个本质变化是：

- V2：价格 = 储备比（连续空间）
- V3：价格 = tick 索引（离散空间）

## 2. TickSpacing

在 Uniswap V3 中，并不是所有 tick 都可以被使用。tickSpacing 是对 tick 的“步长约束”，决定哪些 tick 可用。

<MathBlock tex={String.raw`tick \in \{ ..., -2s, -s, 0, s, 2s, ... \}`} />

其中：s = tickSpacing

例如当 tickSpacing = 2 时：

![Diagram 20260403095909](/img/notes/pasted-image-20260403095909.png)

只有绿色虚线 `tick` 可以被初始化流动性，其他 tick 不允许初始化流动性。所以 tickSpacing 本质上是对价格离散精度的控制。

在合约中，tickSpacing 直接决定系统中 tick 的总数量：

<MathBlock tex={String.raw`\text{numTicks} = \frac{\text{maxTick} - \text{minTick}}{\text{tickSpacing}} + 1`} />

tickSpacing 越小：

- tick 越密集
- numTicks 越大
- 状态数量越多
- gas 成本越高

tickSpacing 越大：

- tick 越稀疏
- numTicks 越小
- gas 成本越低

因此：

tickSpacing 本质是在做一个 trade-off：

- 精度（price granularity）
- gas 成本（state size）

在 Uniswap V3 中，tickSpacing 是由 fee tier 决定的，  在 pool 创建时固定，不能修改。

| Fee Tier | TickSpacing |
|----------|------------|
| 0.01%    | 1          |
| 0.05%    | 10         |
| 0.3%     | 60         |
| 1%       | 200        |

在创建不同币对池子时，并不是直接选择 tickSpacing，  而是通过选择 fee tier 间接决定 tickSpacing。tickSpacing 与 fee tier 绑定，本质是一个设计权衡：

- 低手续费 → 高精度（小 tickSpacing）
- 高手续费 → 低精度（大 tickSpacing）

> 例如：
>
> 1. 低波动资产（如 stablecoin）
>
> - 价格波动小
> - 需要更高精度
> - LP 需要更低收益补偿
> - 使用小 tickSpacing
>
>
> 2. 高波动资产（如 ETH/USDC）
>
> - 价格波动大
> - 精度要求低
> - LP 需要更高收益补偿
> - 使用大 tickSpacing

## 3. sqrtPriceX96

在前面我们已经知道：

<MathBlock tex={String.raw`P = 1.0001^{\text{tick}}`} />

但在实际合约中，Uniswap V3 并不会直接存储 `price`浮点数。因为 Solidity 不支持浮点数，因此需要使用整数表示价格。 <InlineMath tex={String.raw`Q96 = 2^{96}`} /> 是一种 fixed-point 表示方法：

<MathBlock tex={String.raw`\text{sqrtPriceX96} = \sqrt{P} \cdot 2^{96}`} />

这样可以在整数范围内保持高精度，从 sqrtPriceX96 也可以反推出价格：

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

输出结果：

<MathBlock tex={String.raw`P_{\text{real}} \approx 1888.97`} />

因此可以得到：

<MathBlock tex={String.raw`\text{tick} = \frac{2 \cdot \log\left(\frac{\text{sqrtPriceX96}}{2^{96}}\right)}{\log(1.0001)}`} />

因此我们已经知道 `tick` 是价格的离散索引用于区间定位，`sqrtPriceX96` 是价格的真实表示用于计算。
