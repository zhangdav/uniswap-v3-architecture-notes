---
id: overview
title: 00 协议纵览
sidebar_label: 00 协议纵览
slug: /
---

import InlineMath from '@site/src/components/InlineMath';
import MathBlock from '@site/src/components/MathBlock';

## 概述

在 Uniswap V2 中，流动性被均匀分布在整个价格区间 `(0, ∞)` 上。这意味着，无论价格位于何处，池子始终能够提供流动性，整个 AMM 曲线（`x * y = k`）都由真实资金支撑。

然而，交易的发生具有明显的“局部性”：价格发生变化时，状态点只会沿着曲线移动一小段路径，
即仅有当前价格附近的一小部分流动性参与了本次交易。

换句话说：流动性是全局分布的，但交易只消耗局部区间内的流动性。

这带来了一个关键问题：大部分流动性在任意时刻都没有参与交易，只是被动地分布在价格区间的其他位置，从而导致资金利用率较低。

![Diagram 20260331151223](/img/notes/pasted-image-20260331151223.png)

从图片中可以看到，尽管整个曲线都由流动性支撑，但一次交易仅沿着曲线移动一小段路径（右图黄色弧线），这意味着大部分流动性在本次交易中并未被使用。

因此，一个自然的问题是：是否可以只在这段路径附近提供流动性？这正是 Uniswap V3 的核心思想。

在 V3 中，流动性不再分布在整个价格区间上，而是集中在一个有限区间 `[p_lower, p_upper]` （白皮书中用 P of A 和 P of B 表示）内。

![Diagram 20260331165852](/img/notes/pasted-image-20260331165852.png)

左边图中橙色区域表示提供的区间流动性，流动性不再全局分布，而是集中在有限区间内。如果我们放大这个橙色区间，可以发现在右图该区间内，价格仍然沿着一条类似 `x * y = k` 的曲线变化。但需要注意这段曲线本身并不是独立存在的，而是嵌入在一条更完整的 AMM 曲线之中。

为了在只提供局部流动性的情况下，仍然维持连续且一致的价格函数，V3 引入了 virtual liquidity。其本质是在 x 和 y 方向引入偏移量`x_virtual, y_virtual`，将当前的真实状态 `(x, y)` 嵌入到一个更大的坐标系中，从而使该状态仍然落在一条完整的 AMM 曲线上。

![Diagram 20260331170233](/img/notes/pasted-image-20260331170233.png)

在引入虚拟流动性后，我们可以将当前状态嵌入到一条完整的恒定乘积曲线中：

<MathBlock tex={String.raw`(x_R + x_V)(y_R + y_V) = L^2`} />

其中：

- <InlineMath tex={String.raw`x_R, y_R`} />：真实储备（real reserves）
- <InlineMath tex={String.raw`x_V, y_V`} />：虚拟储备（virtual reserves）
- <InlineMath tex={String.raw`L`} />：流动性（liquidity）
