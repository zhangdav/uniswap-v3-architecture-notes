---
id: position
title: 05 Position
sidebar_label: 05 Position
---

import InlineMath from '@site/src/components/InlineMath';
import MathBlock from '@site/src/components/MathBlock';

## 概述

在前一章中，我们已经分析了 `swap` 价格推进的完整过程：

- price 在曲线上连续移动
- liquidity 在 tick 处发生离散变化
- 整个过程由 while 循环驱动

这些 liquidity 来自所有 LP 的 Position。因此，如果说：swap 描述的是“价格如何移动”，那么Position 描述的是“流动性从哪里来”。

在 V3 中，一个 LP 并不是“把钱存进池子”，而是在一个价格区间上，提供一段流动性。一个 Position 可以抽象为：

```

(liquidity, tickLower, tickUpper)

```

- `liquidity`：在该区间内提供的流动性强度
- `tickLower`：区间下界
- `tickUpper`：区间上界

### 1. Position 与价格的关系

一个 Position 是否参与交易，只取决于当前价格是否在区间内。

![Diagram 20260427180001](/img/notes/pasted-image-20260427180001.png)

![Diagram 20260427180002](/img/notes/pasted-image-20260427180002.png)

![Diagram 20260427180003](/img/notes/pasted-image-20260427180003.png)

### Case 1：价格在区间内

```

tickLower ≤ currentTick < tickUpper

```

此时：

- Position 提供流动性
- 参与 swap
- 可以赚取手续费

---

### Case 2：价格低于区间

```

currentTick < tickLower

```

此时：

- Position 不参与 swap
- 资产完全表现为 token0

---

### Case 3：价格高于区间

```

currentTick ≥ tickUpper

```

此时：

- Position 不参与 swap
- 资产完全表现为 token1

### 2. Position 如何构成 pool 的流动性

在 V3 中，在某一个价格区间内，当前有效流动性 = 所有 active Position 的 liquidity 之和。所以 swap 并不是和某一个 LP 交互，而是和“当前区间内所有 LP 的聚合流动性”交互。

在前一章介绍 swap 价格推进时，当 price 到达 tick 会发生 crossing tick，然后 liquidity 也会发生变化。对应代码 `liquidity += liquidityNet` ，其实这里的 `liquidityNet` 来自在该 tick 上开始或结束的 Position。

```

liquidityNet = Σ（所有在该 tick 边界开始或结束的 Position 的 liquidity 变化）

```

所以本质上 tick 是 Position 的边界，`liquidityNet` 是 Position 的进出变化，而 swap 是在 Position 组成的流动性上移动价格。

### 3. 开仓位：`mint`

创建一个仓位的过程，其实是把 token 转换为 liquidity，并绑定到一个价格区间。NPM 合约中的 `mint` 函数完成三件事：

1. 确定价格区间（tickLower / tickUpper）
2. 根据当前价格和区间，计算 liquidity
3. 转入对应数量的 token0 / token1

实际流程为用户提供 `amount0Desired/amount1Desired`，然后根据当前价格和区间，计算“最多能支持的 liquidity”，再将多余的一侧 token 退回或不使用。

所以，在 V3 中 liquidity 不是直接输入的，而是由 amount0 / amount1 推导出来的，并且不同的价格位置，对应不同资产结构：

| 位置       | 需要的资产           |
| -------- | --------------- |
| 当前价格在区间内 | token0 + token1 |
| 价格低于区间   | 只需要 token0      |
| 价格高于区间   | 只需要 token1      |

具体计算的公式可以参考《01_Liquidity 数学表达式》中的 4. 流动性 <InlineMath tex={String.raw`L`} /> 的计算 部分。

### 4. 加仓：`increaseLiquidity`

本质是在同一价格区间内追加流动性。

- 区间 `tickLower / tickUpper` 不变
- 需要额外投入 token
- 在数学上，仍然是根据当前价格 <InlineMath tex={String.raw`P_c`} />、区间 <InlineMath tex={String.raw`[P_A, P_B]`} /> 以及新增的 `amount0 / amount1` 推导新增的 liquidity
- 若价格在区间内，需要同时考虑 token0 / token1 两侧约束，最终取两者可支持的较小 liquidity
- 若价格在区间外，则退化为单边资产增加流动性

合约实现上，`increaseLiquidity` 会先通过 `LiquidityAmounts.getLiquidityForAmounts(...)`
根据当前价格和投入数量计算本次可新增的 liquidity。在增加 liquidity 之前，会先结算当前仓位已累计但尚未入账的手续费，然后再更新 liquidity 调用 `pool.mint(...)`  完成加仓。计算公式参考：《01_Liquidity 数学表达式》- 4. 流动性 <InlineMath tex={String.raw`L`} /> 的计算。

### 5. 减仓：`decreaseLiquidity`

和加仓相反是从当前仓位中移除一部分 liquidity。

- `liquidity` 减少
- 对应部分 token 被释放出来
- 但不会自动转到用户钱包，需要后续调用 `collect`

数学上，它仍然基于同一套 V3 流动性公式，只是方向相反：

- 加仓：`amount0 / amount1 -> liquidity`
- 减仓：`liquidity -> amount0 / amount1`

合约实现上，`decreaseLiquidity` 直接调用 pool 的 `burn(...)`，由 core 根据当前价格位置和区间结算本次移除的 liquidity 对应应释放的 `amount0 / amount1`，计算公式可以参考《01_Liquidity 数学表达式》- 4.2 由 Liquidity 计算 Token 数量。

需要注意的是，在加仓或减仓时都要计算一次手续费，因为 V3 的手续费并不是自动实时领取的，而是通过 `feeGrowthInsideLastX128 + tokensOwed` “快照 + 延迟结算”的方式记账。

所以在发生以下 `increaseLiquidity`、`decreaseLiquidity`、`collect`操作时，合约都会先执行一次“手续费结算”，即根据当前的 feeGrowthInside，计算从上一次快照以来新增的手续费，并累计到 tokensOwed 中。然后再更新 liquidity 或执行领取。否则，会出现旧仓位已经赚到的手续费丢失，新增 liquidity 错误地参与分享历史手续费。

但这些手续费并不会自动转出，而是需要通过后续的 collect 操作才能真正提取。那么这些手续费是如何被精确计算和分配的？collect 又是如何将这些收益转移到用户手中的？这正是下一章要讨论的核心内容。
