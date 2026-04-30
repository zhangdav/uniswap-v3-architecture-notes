---
id: oracle-and-twap
title: 08 Oracle 与 TWAP
sidebar_label: Oracle 与 TWAP
---

import InlineMath from '@site/src/components/InlineMath';
import MathBlock from '@site/src/components/MathBlock';

## 概述

在链上，我们需要一个价格：

- 能抗操纵（不被 flash loan 轻易影响）
- 能反映一段时间内的真实价格
- 不依赖链下记录

因此引入时间加权价格：

<MathBlock tex={String.raw`\text{TWAP (Time Weighted Average Price)}`} />

V2 的做法，通过累加价格来实现：

<MathBlock tex={String.raw`a(t) = a(t-1) + price \cdot \Delta t`} />

查询区间价格：

<MathBlock tex={String.raw`p(t_1,t_2) = \frac{a(t_2) - a(t_1)}{t_2 - t_1}`} />

V3 的核心改进，不再直接记录 price，而是记录：

<MathBlock tex={String.raw`tick = \log_{1.0001}(price)`} />

因此：

<MathBlock tex={String.raw`price = 1.0001^{tick}`} />

本质变化，是将 <InlineMath tex={String.raw`price \cdot \Delta t`} /> 转换为 <InlineMath tex={String.raw`tick \cdot \Delta t`} />

利用：

<MathBlock tex={String.raw`\log(p_1 \cdot p_2) = \log p_1 + \log p_2`} />

## 1. tickCumulative（核心累加器）

定义：

<MathBlock tex={String.raw`tickCumulative(t) = \sum tick \cdot \Delta t`} />

更新方式：

<MathBlock tex={String.raw`tickCumulative = tickCumulative + tick_{current} \cdot (t_{now} - t_{last})`} />

## 2. TWAP 计算

给定两个时间点：

<MathBlock tex={String.raw`t_1,\quad t_2`} />

##### Step 1：平均 tick

<MathBlock tex={String.raw`\bar{tick} = \frac{tickCumulative(t_2) - tickCumulative(t_1)}{t_2 - t_1}`} />

---

##### Step 2：还原价格

<MathBlock tex={String.raw`p(t_1,t_2) = 1.0001^{\bar{tick}}`} />

---

## 3. 为什么使用 tick（log）

几何平均

<MathBlock tex={String.raw`\log(p_1) + \log(p_2) = \log(p_1 \cdot p_2)`} />

对应价格关系

<MathBlock tex={String.raw`price = 1.0001^{tick}`} />

## 4. Observation（历史快照）

V3 在链上存储多个时间点的状态，每个记录包含：

- 时间戳
- tickCumulative
- secondsPerLiquidityCumulative

每个 Observation 表示“某一时刻的累加器快照”。

## 5. secondsPerLiquidity Oracle

定义：

<MathBlock tex={String.raw`secondsPerLiquidityCumulative = \sum \frac{\Delta t}{liquidity}`} />

含义

表示单位流动性参与做市的时间。

- liquidity 越大 → 单位分到时间越少
- liquidity 越小 → 单位分到时间越多

## 6. Oracle 查询

查询两个时间点：

<MathBlock tex={String.raw`t_1,\quad t_2`} />

计算：

<MathBlock tex={String.raw`TWAP = \frac{tickCumulative(t_2) - tickCumulative(t_1)}{t_2 - t_1}`} />

与 Fee 系统的统一视角

Fee 系统：

<MathBlock tex={String.raw`f(i_{lower}, i_{upper}) = f_g - f_b - f_a`} />

Oracle 系统：

<MathBlock tex={String.raw`p(t_1,t_2) = \frac{\Delta tickCumulative}{\Delta t}`} />

所以 V2 和 V3 在本质上是统一的，都表达为：

<MathBlock tex={String.raw`value = cumulative(end) - cumulative(start)`} />

区别仅在维度：

- fee：在 tick 空间做差分
- oracle：在时间维度做差分

V3 的 Oracle 本质是：

- 对 tick（log price）进行时间积分
- 查询时通过差分恢复平均价格

最终得到：

<MathBlock tex={String.raw`TWAP = \frac{\Delta tickCumulative}{\Delta t}`} />

其核心设计与 fee 系统完全一致：

- 累加器（cumulative）
- 区间差分（delta）

只是应用在不同维度：

- fee → 空间（price range）
- oracle → 时间（time）
