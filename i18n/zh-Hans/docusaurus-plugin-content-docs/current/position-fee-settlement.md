---
id: position-fee-settlement
title: 07 Position 收益结算
sidebar_label: Position 收益结算
---

import InlineMath from '@site/src/components/InlineMath';
import MathBlock from '@site/src/components/MathBlock';

## 概述

在前一章中，我们已经推导出：

<MathBlock tex={String.raw`f_{\text{inside}} = f_g - f_b(i_l) - f_a(i_u)`} />

并且得到了区间内累计手续费的统一表达方式。但是，这里仍然有一个关键问题没有解决：LP 的收益是如何在合约中被记录和结算的？

### 1. 核心问题：为什么不能实时分配手续费？

在 V2 中：

- 所有流动性是全局的
- fee 直接进入池子储备
- LP 通过 share 自动持有

但在 V3 中：

- liquidity 是分区间的
- 不同 LP 在不同时间参与 swap
- 无法逐笔分配

如果每次 swap 都给每个 LP 分钱 gas 直接爆炸。

### 2. V3 的核心思想：延迟结算（Lazy Settlement）

V3 并不会在每一笔 swap 时给 LP 分配手续费，而是先累计，后结算。

每个 position 会记录：

```solidity

feeGrowthInside0LastX128
feeGrowthInside1LastX128

tokensOwed0
tokensOwed1

```

当一个 LP 创建或更新仓位时，会记录：

<MathBlock tex={String.raw`f_{\text{entry}} = f_{\text{inside}} \ \text{at entry}`} />

记为：

<MathBlock tex={String.raw`f_{\text{last}}`} />

当前时刻

<MathBlock tex={String.raw`f_{\text{now}} = \text{当前区间内的 feeGrowth}`} />

收益计算

<MathBlock tex={String.raw`\Delta f = f_{\text{now}} - f_{\text{last}}`} />

从 feeGrowth 到真实收益

<MathBlock tex={String.raw`f_g = \sum \frac{f_i}{L_i}`} />

它表示单位 liquidity 的收益。因此，LP 实际收益为：

<MathBlock tex={String.raw`\text{tokensOwed} = L \cdot (f_{\text{now}} - f_{\text{last}})`} />

其中：

- <InlineMath tex={String.raw`L`} /> = LP 的 liquidity
- <InlineMath tex={String.raw`f_{\text{now}}`} /> = 当前区间内累计 fee
- <InlineMath tex={String.raw`f_{\text{last}}`} /> = 上次结算时的快照

核心公式：

<MathBlock tex={String.raw`\text{tokensOwed} += L \cdot \left( f_{\text{inside, now}} - f_{\text{inside, last}} \right)`} />

### 3. 什么时候会结算？

V3 不会自动发钱，只有在以下操作时才会触发：

##### 1. mint（开仓）

- 初始化 position
- 记录初始快照：

<MathBlock tex={String.raw`f_{\text{last}} = f_{\text{inside}}`} />

##### 2. increaseLiquidity（加仓）

在加仓前必须先结算：

<MathBlock tex={String.raw`\text{tokensOwed} += L \cdot \left( f_{\text{inside, now}} - f_{\text{inside, last}} \right)`} />

然后更新：

<MathBlock tex={String.raw`f_{\text{last}} = f_{\text{inside}}`} />

再增加 liquidity，因为新增加的 liquidity 不应该获得历史收益。

##### 3. decreaseLiquidity（减仓）

同样：

- 先结算旧收益
- 再减少 liquidity

##### 4. collect（领取收益）

collect 不计算收益，它只做一件事 `transfer(tokensOwed)` ，然后 `tokensOwed = 0`。

##### 举个例子🌰：

> 假设：
>
> LP 提供 liquidity：S = 100
> 初始：

> <MathBlock tex={String.raw`f_{\text{last}} = 10`} />
>
> 单位：token / liquidity

> 一段时间后：

> <MathBlock tex={String.raw`f_{\text{now}} = 15`} />

> 那么：

> <MathBlock tex={String.raw`\Delta f = 5`} />

> 表示每单位 liquidity 多赚了 5 token，因此总收益：
>

> <MathBlock tex={String.raw`\text{tokensOwed} = 100 \cdot 5 = 500`} />

  注： 在真实 Uniswap V3 合约中：`feeGrowthInsideX128` 实际是：

> <MathBlock tex={String.raw`\text{feeGrowthInsideX128} = f \cdot 2^{128}`} />

 LP 收益计算（链上真实公式）：

> <MathBlock tex={String.raw`\text{tokensOwed} = L \cdot \frac{f_{\text{inside, now}} - f_{\text{inside, last}}}{2^{128}}`} />

  注：这里的 f 表示单位 liquidity 的累计收益（fee / liquidity），而不是实际 token 数量。
