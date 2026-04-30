---
id: fee-and-settlement
title: 06 Fee 和资金结算
sidebar_label: Fee 和资金结算
---

import InlineMath from '@site/src/components/InlineMath';
import MathBlock from '@site/src/components/MathBlock';

## 概述

在前一章中，我们已经理解了 LP 通过提供 liquidity 参与 swap，这章我们将解释 V3 中非常核心的问题：LP 的收益是如何计算的？在 Uniswap 中，LP 的收益主要来源于交易手续费 `swap fee`，但在 V2 和 V3 中是完全不同的。

在 V2 中，所有流动性是全局共享的，没有价格区间，所有 LP 的资金都参与每一笔交易。所以，在每一笔 swap 中交易者支付手续费（如 0.3%），这些手续费会直接加入池子的储备`reserve`。LP 并不会直接领取 fee，而是通过 LP token 的份额，间接拥有 pool 的一部分资产。

其本质是：

```

LP 收益 ∝ LP 持有份额 × 池子累计手续费

```

所以在 V2 中，不需要逐笔计算 fee，不需要区分区间，不需要 tracking 历史。

但是，在 V3 中问题变复杂了，V3 中 liquidity 被分布在不同价格区间，且只有 active 的 liquidity 才参与 swap，每个区间的 liquidity 都不同。这意味着：不同 LP，在不同时间、不同区间，参与交易的程度是不同的。

## 1. 单次 swap

我们先不看合约，先从理论上应该怎么算出发。

![Diagram 20260422111021](/img/notes/pasted-image-20260422111021.png)

- 黄色柱子：不同 tick 区间的总 liquidity（L）
- 粉色横条：Alice 提供的 liquidity（S）
- 虚线位置：价格在移动（swap 过程）
- f₀, f₁：在不同区间产生的手续费

假设：用户用 token Y 交换 token X（价格向右移动）

```

Step 1：在第一个区间内成交（L₀）

价格先在区间 L₀ 内移动
→ 产生手续费 f₀
→ 所有在该区间的 LP 参与分配

Step 2：价格进入下一个区间（L₁）

价格继续移动到下一个区间 L₁
→ 又产生手续费 f₁
→ 在该区间的 LP 重新参与分配

```

Alice 能拿多少手续费？

在区间 <InlineMath tex={String.raw`L_0`} /> 中：

```

Alice 占比 = S / L₀

获得手续费 = f₀ × (S / L₀)

```

在区间 <InlineMath tex={String.raw`L_1`} /> 中：

```

Alice 占比 = S / L₁

获得手续费 = f₁ × (S / L₁)

```

总收益：

<MathBlock tex={String.raw`f = f_0 \cdot \frac{S}{L_0} + f_1 \cdot \frac{S}{L_1}`} />

所以，每一个价格区间都是一个独立的手续费分配池。LP 在每个区间中按照自己 liquidity 占该区间总 liquidity 的比例，分摊该区间产生的手续费。

## 2. 多区间（引入时间）

但是在 V3 中并不是简单的单次 swap，而是会发生 swap 跨越多个区间、不同时间、不同区间中的手续费分配。

![Diagram 20260422111049](/img/notes/pasted-image-20260422111049.png)

黄色柱子：某个时刻、某个 tick 区间内的总流动性
- 粉色横条 `S`：Alice 自己提供的 liquidity
- 紫色标记 `L_{i,t}`：第 `t` 个时刻、第 `i` 个区间中的总流动性
- 橙色标记 `f_{i,t}`：第 `t` 个时刻、第 `i` 个区间内产生的手续费

这里我们把“区间”记为 `i`，把“时间”记为 `t`。

---

### Case 1： `t = 0`

在第一个时刻，价格向右移动，并跨过了两个区间。

图中对应的是：

- 在区间 `i = 0` 中，产生了手续费 `f_{0,0}`
- 在区间 `i = 1` 中，产生了手续费 `f_{1,0}`

而 Alice 在这两个区间里都提供了流动性 `S`，因此她可以分别按占比分到这两个区间的手续费。
在区间 `i = 0` 中，Alice 的占比为：<InlineMath tex={String.raw`S / L_{0,0}`} />，所以她在这个区间拿到的手续费是： <InlineMath tex={String.raw`f_{0,0} \cdot \frac{S}{L_{0,0}}`} />

同理，在区间 `i = 1` 中，她拿到：<InlineMath tex={String.raw`f_{1,0} \cdot \frac{S}{L_{1,0}}`} />

因此，第一个图对应的总收益为：

<MathBlock tex={String.raw`f^{(0)} = f_{0,0} \cdot \frac{S}{L_{0,0}} + f_{1,0} \cdot \frac{S}{L_{1,0}}`} />

---

### Case 2：`t = 1`

到了第二个时刻，价格向左移动。

在这个时刻，价格向左移动，对应 swap 方向为 X → Y。由于我们当前只关注 token Y 的 fee：

- 此方向不会产生 Y 的手续费
- 因此对 feeGrowth(Y) 没有贡献

因此：

<MathBlock tex={String.raw`f^{(1)} = 0`} />

所以，不是 Alice 在每一个时刻、每一个区间都会产生可分配的手续费。

---

### Case 3：`t = 2`

在第三个时刻，价格再次向右移动，并跨过了更多区间。

图中对应的是：

- 在区间 `i = -2` 中，产生了手续费 `f_{-2,3}`
- 在区间 `i = -1` 中，产生了手续费 `f_{-1,3}`
- 在区间 `i = 0` 中，产生了手续费 `f_{0,3}`

而这些区间当前的总流动性分别为：

- `L_{-2,3}`
- `L_{-1,3}`
- `L_{0,3}`

因此，Alice 在这个时刻得到的总手续费为：

<MathBlock tex={String.raw`f^{(3)} =

f_{-2,3} \cdot \frac{S}{L_{-2,3}}
+ f_{-1,3} \cdot \frac{S}{L_{-1,3}}
+ f_{0,3} \cdot \frac{S}{L_{0,3}}`} />

上面已经告诉我们一个核心：LP 的手续费，不是全池统一平均分配的，而是在每个区间中，按 liquidity 占比分开计算。如果我们暂时**不考虑时间**，只看某一次价格移动跨过了多个区间的情况，那么 Alice 的总收益可以写成：

<MathBlock tex={String.raw`f = \sum_i f_i \cdot \frac{S}{L_i}`} />

- `f_i`：第 `i` 个 step 中产生的手续费
- `L_i`：第 `i` 个区间的总流动性
- `S`：Alice 的流动性

这个公式的意思：

> 对于价格经过的每一个区间，Alice 都按自己在该区间中的 liquidity 占比，分得该区间产生的手续费。

如果把 `S` 提出来，还可以写成：

<MathBlock tex={String.raw`f = S \cdot \sum_i \frac{f_i}{L_i}`} />

它已经开始接近后面 `feeGrowth` 的思想了。

前面我们加入了时间维度，因为现实中，swap 不会只发生一次。价格会在不同时间不断变化，不同区间的 liquidity 也可能发生变化，因此手续费分配不只是“跨区间”，而是也“跨时间”的。

所以在第 `t` 个时刻，Alice 的收益可以写成：

<MathBlock tex={String.raw`f_t = S \cdot \sum_i \frac{f_{i,t}}{L_{i,t}}`} />

表示：在时刻 `t`，Alice 在所有相关区间中的手续费收益之和。

如果再把所有时间段加总，那么 Alice 从起始时刻到最终时刻的总收益就是：

<MathBlock tex={String.raw`f = \sum_t f_t`} />

把上面两个式子合并起来，可以得到最终的一般形式：

<MathBlock tex={String.raw`f = S \cdot \sum_t \sum_i \frac{f_{i,t}}{L_{i,t}}`} />

所以，V3 中 LP 的收益，是一个“跨时间 + 跨区间”的双重加权求和问题。在每一个时间点、每一个价格区间中，按照该 LP 的 liquidity 占比来分摊手续费。那么问题是：为什么不能直接按这个公式在链上算？

因为这样做意味着必须遍历：所有时间点、所有发生过 swap 的区间、所有区间对应的 liquidity 变化。这在链上显然是不可行的，因为 gas 成本会爆炸。

所以这个公式是“理论上最直观的手续费定义”，但不是合约中真正直接执行的方式。也正因为如此，V3 才必须设计一套压缩记账的方法，把这个复杂求和压缩成后面要讲的 `feeGrowth` 机制。

## 3. 从逐笔计算到 `feeGrowth`

上面的公式给出了 LP 收益的“理论定义”，但在链上逐笔计算这些值是不可行的。因此，我们需要一种方法：不记录每一笔交易，而是记录“累计的单位 liquidity 收益”，即 V3 的核心设计：`feeGrowth`。

我们定义 `feeGrowth` 为“单位 liquidity 的累计收益”：

<MathBlock tex={String.raw`f_g = \sum_{i=0}^{N} \frac{f_i}{L_i}`} />

也可以展开写为：

<MathBlock tex={String.raw`f_g = \frac{f_0}{L_0} + \frac{f_1}{L_1} + \cdots + \frac{f_N}{L_N}`} />

也就是说，`feeGrowth` 表示“每单位 liquidity 到目前为止赚到的手续费”。注意：这里记录的不是总 fee，而是 fee / liquidity。

那么 `feeGrowth` 是如何变化的？以下面图片中的例子为例：

![Diagram 20260422111153](/img/notes/pasted-image-20260422111153.png)

黄色柱子表示不同 tick 区间中的总流动性
- `L₂`、`L₃`、`L₄` 表示对应区间内的有效 liquidity
- 绿色折线表示价格在 swap 过程中跨越多个区间时，手续费累计的过程
- `f₀, f₁, f₂, f₃, f₄` 表示在不同 step / 不同区间中产生的手续费片段

这里最关键的是先理解`f0, f1, f2, f3, f4` 不是同一个区间里的重复 fee，而是 swap 在不同 step 中，分别收取到的手续费增量。

`f0`

价格刚开始移动，在最初那个 step 中发生了一段成交，收取了手续费 `f0`。
此时对应的总流动性是 `L0`，因此它对 fee growth 的贡献是：

<MathBlock tex={String.raw`\frac{f_0}{L_0}`} />

---
`f1`

价格继续在下一小段路径中移动，又发生一段成交，收取了手续费 `f1`。
此时对应区间的有效流动性是 `L1`，因此贡献是：

<MathBlock tex={String.raw`\frac{f_1}{L_1}`} />

---
`f2`

价格进一步进入图中标记为 `L₂` 的区间流动性，并在这个区间内发生一段成交，收取手续费 `f2`。
因此这一步的贡献是：

<MathBlock tex={String.raw`\frac{f_2}{L_2}`} />

---
`f3`

价格继续推进到下一个 step，对应区间总流动性为 `L₃`，此时又收取手续费 `f3`。
因此贡献为：

<MathBlock tex={String.raw`\frac{f_3}{L_3}`} />

---
`f4`

最后，价格进入 `L₄` 对应的区间流动性，再次发生一段成交，收取手续费 `f4`。
因此贡献为：

<MathBlock tex={String.raw`\frac{f_4}{L_4}`} />

因为 `feeGrowth` 本质上是一个累计量。它不是记录某一次 swap 的总 fee，而是在记录：到当前为止，所有 step 对“每单位 liquidity 收益”贡献的累计和。

所以图中的绿色折线，其实就是在表达：

- 先加上 `f0 / L0`
- 再加上 `f1 / L1`
- 再加上 `f2 / L2`
- 再加上 `f3 / L3`
- 再加上 `f4 / L4`

每发生一个新的 step，`feeGrowth` 就增加一次。

<MathBlock tex={String.raw`f_g

=
\frac{f_0}{L_0}
+
\frac{f_1}{L_1}
+
\frac{f_2}{L_2}
+
\frac{f_3}{L_3}
+
\frac{f_4}{L_4}`} />

如果把这个例子推广，那么在任意一段 swap 过程中，`feeGrowth` 都可以写成：

<MathBlock tex={String.raw`f_g = \sum_{i=0}^{N} \frac{f_i}{L_i}`} />

- `f_i`：第 `i` 个 step 中收取的手续费
- `L_i`：第 `i` 个 step 对应区间的有效流动性

结合上图，我们可以用“规则”的方式总结 swap 过程中 fee growth 的变化：

#### 规则 1：当发生手续费收取时，fee growth 增加

在 swap 过程中：

- 每一个 step 中，如果发生交易并收取手续费 <InlineMath tex={String.raw`f_i`} />
- 且当前区间的流动性为 <InlineMath tex={String.raw`L_i`} />

那么 fee growth 会增加：

<MathBlock tex={String.raw`\Delta f_g = \frac{f_i}{L_i}`} />

在图中的对应：

- 在 tick 3 区间：产生 <InlineMath tex={String.raw`f_0`} /> -> fee growth 增加  <InlineMath tex={String.raw`\frac{f_0}{L_0}`} />
- 在 tick 4 区间：产生 <InlineMath tex={String.raw`f_1`} /> -> fee growth 增加  <InlineMath tex={String.raw`\frac{f_1}{L_1}`} />
- 在 tick2 区间：产生 <InlineMath tex={String.raw`f_2`} /> → fee growth 增加 <InlineMath tex={String.raw`\frac{f_2}{L_2}`} />
- 在 tick3 区间：产生 <InlineMath tex={String.raw`f_3`} /> → fee growth 增加 <InlineMath tex={String.raw`\frac{f_3}{L_3}`} />
- 在 tick4 区间：产生 <InlineMath tex={String.raw`f_4`} /> → fee growth 增加 <InlineMath tex={String.raw`\frac{f_4}{L_4}`} />

---

#### 规则 2：fee growth 是“累加量”，不会减少

- fee growth 只会增加
- 不会因为价格回退而减少

因此：

- 图中的虚线（fee growth）始终向上
- 不会出现下降

---

#### 规则 3：不同方向的 swap，对 fee growth 的影响不同

对于某个 token（例如 token Y）：

- 当 swap 是 Y → X（输入 Y）
- 会收取 Y 的手续费
- fee growth 增加

- 当 swap 是 X → Y（输入 X）
- 不收取 Y 的手续费
- fee growth 不变

总结，fee growth 的变化可以用一句话概括：fee growth 只在“收取对应 token 手续费”时增加，其余情况下保持不变。

## 4. 从 `feeGrowth` 到 `feeGrowthInside`

在上一节中，我们已经得到一个关键结论：

<MathBlock tex={String.raw`f = S \cdot \sum_t \sum_i \frac{f_{i,t}}{L_{i,t}}`} />

并进一步抽象出：

<MathBlock tex={String.raw`f_g = \sum_{i=0}^{N} \frac{f_i}{L_i}`} />

我们可以用 `feeGrowth` 来表示单位 liquidity 的累计手续费。

但是这还不够，虽然 `feeGrowth` 已经把“跨时间 + 跨区间”的复杂求和压缩成一个累计量，但仍然存在一个关键问题：LP 只应该获得自己价格区间内的手续费。`feeGrowth` 是全局累计，但 LP 只关心[i_lower, i_upper] 区间内的部分。

如果我们通过遍历所有历史 step 的方法来计算，这在链上是完全不可行的（gas 爆炸）。所以，V3 的优化办法是用“减法”代替“遍历”。它不会去“找区间内的 fee”，而是用`全局 fee - 区间外 fee`。

### 4.1 三个关键量

![Diagram 20260422111413](/img/notes/pasted-image-20260422111413.png)

下面我们将根据图片介绍如何用全局 `fee - 区间外 fee`，我们首先要了解三个关键的变量：

---

#### 1️⃣ 全局 fee growth

<MathBlock tex={String.raw`f_g`} />

表示从系统开始到现在，所有 step 的累计 fee / liquidity

---

#### 2️⃣ 区间外（below / above）

对于任意 tick <InlineMath tex={String.raw`i`} />：

下方累计：

<MathBlock tex={String.raw`f_b(i) = \text{fee growth below tick } i`} />

上方累计：

<MathBlock tex={String.raw`f_a(i) = \text{fee growth above tick } i`} />

---

#### 3️⃣ 区间内 fee growth

对于一个 LP 区间：

<MathBlock tex={String.raw`[i_l, i_u]`} />

定义：

<MathBlock tex={String.raw`f_{\text{inside}}(i_l, i_u)`} />

核心公式：

<MathBlock tex={String.raw`f_{\text{inside}} = f_g - f_b(i_l) - f_a(i_u)`} />

---

#### 🟥 左侧红色（below）

- 表示 <InlineMath tex={String.raw`f_b(i_l)`} />
- 即：**在 lower tick 左边产生的 fee**

这些 fee 不属于当前 LP

#### 🟥 右侧红色（above）

- 表示 <InlineMath tex={String.raw`f_a(i_u)`} />
- 即：**在 upper tick 右边产生的 fee**

同样不属于当前 LP

#### 🟢 中间绿色（inside）

全局
- 左边不要的
- 右边不要的

剩下的，就是 LP 区间内真正应该拿到的 fee

公式：

<MathBlock tex={String.raw`\text{feeGrowthInside} = \text{global cumulative} - \text{outside-range cumulative}`} />

即：`feeGrowthInside = 全局累计 - 区间外累计`

这样设计带来三个好处：

1. 不需要遍历历史 `O(N) → O(1)`，只需要当前 global 和两个边界 tick 的状态；
2. 支持任意 LP 区间，无论 LP 什么时候进场，选择什么区间，价格如何来回穿越，都可以用同一套公式计算；
3. 链上不会 gas 爆炸，并且只需要存 `feeGrowthGlobal` 和每个 tick 的 `feeGrowthOutside`，即可完成所有 LP 的结算。

## 5. Fee Growth Below（下方累计）

我们先关注一个固定的 tick：<InlineMath tex={String.raw`i`} />。我们定义：<InlineMath tex={String.raw`f_b(i)`} /> ，表示在所有历史 swap 中，发生在 tick <InlineMath tex={String.raw`i`} /> 下方的累计 fee growth。

![Diagram 20260422111446](/img/notes/pasted-image-20260422111446.png)

从图中可以看到：

- 绿色折线表示全局 fee growth <InlineMath tex={String.raw`f_g`} /> 随时间的变化
- 红色区域表示在 tick <InlineMath tex={String.raw`i`} /> 下方产生的 fee

随着时间推进：

- 当价格在 tick <InlineMath tex={String.raw`i`} /> 左侧时，新的 fee 会被计入 “below”
- 当价格在 tick <InlineMath tex={String.raw`i`} /> 右侧时，新的 fee 不属于 below

因此，<InlineMath tex={String.raw`f_b(i)`} /> 本质上是所有发生在 tick <InlineMath tex={String.raw`i`} /> 下方的 fee 的累计。但是，这里有一个核心问题，价格会在 tick <InlineMath tex={String.raw`i`} /> 两侧来回移动。

这意味着：

- 有些 fee 在某个时刻属于 below
- 但如果价格穿过 tick，这些 fee 的“归属方向”会发生变化

因此 <InlineMath tex={String.raw`f_b(i)`} /> 并不是一个可以简单“线性累加”的量。

如果我们按照时间展开，在不同时间点：

<MathBlock tex={String.raw`t_0 < t_1 < t_2 < t_3 < t_4`} />

可以得到：

---

#### 🔹 t₀（价格在 i 左边）

- 所有 fee 都发生在 i 左边，没有 crossing
- 所以：

<MathBlock tex={String.raw`f_b(t_0) = f_{g0}`} />

---

#### 🔹 t₁（价格从 左 → 右 穿过 i）

- 原来“左边”的那部分，现在变成“右边”
- below 区域换边了

所以不能简单用 `below = 之前累积` 计算，而必须用 `below = 当前全局 fee growth - 已归属到右侧的累计`

即：

<MathBlock tex={String.raw`f_b(t_1) = f_{g0} - f_{g1} + f_g`} />

---

#### 🔹 t₂（价格从 右 → 左 穿过 i）

- 发生 crossing，below / above 再次交换
- 当前 price 回到左侧
- 新产生的 fee（fg2）属于 below
- 表达式恢复为“正常累加形态”

<MathBlock tex={String.raw`f_b(t_2) = f_{g0} - f_{g1} + f_{g2}`} />

表示：

- crossing
- 只是把新一段加进表达式

---

#### 🔹 t₃（价格从 左 → 右 穿过 i）

- 再次发生 below 和 above 交换
- fb = fg - 已累计的另一侧 fee

即：

<MathBlock tex={String.raw`f_b(t_3) = f_{g0} - f_{g1} + f_{g2} - f_{g3} + f_g`} />

---

#### 🔹 t4（价格从 右 -> 左 再次穿过 i）

- 再次发生 crossing
- below / above 再次交换
- 表达式再次翻转

即：

<MathBlock tex={String.raw`f_b(t_4) = f_{g0} - f_{g1} + f_{g2} - f_{g3} + f_{g4}`} />

---
总结：

- 每 crossing 一次 tick：
	<InlineMath tex={String.raw`f_b(i)`} /> 会变为：<InlineMath tex={String.raw`f_b(i) = f_g - f_b(i)`} />

- 没有 crossing：
	只是继续累加新的 fee growth（± <InlineMath tex={String.raw`fg_k`} />）

因此整体表现为：

<MathBlock tex={String.raw`f_b(t)

=
f_{g0} - f_{g1} + f_{g2} - f_{g3} + \cdots`} />

也就是说，每 crossing 一次 tick 就发生一次符号翻转。但在实际实现中，V3 并不会按这个公式计算，而是通过状态更新来维护这个结果。

因为如果我们按照这个定义在链上计算 below，将需要遍历所有历史 swap。但这在实际中是不可行的 gas 会爆炸。

为了解决 above / below 无法直接计算的问题，V3 引入了一个关键变量：

<MathBlock tex={String.raw`f_o(i)`} />

设：

<MathBlock tex={String.raw`i_c = \text{current price tick}`} />

其中，<InlineMath tex={String.raw`i_c`} /> 表示当前价格所在 tick。

则：

<MathBlock tex={String.raw`f_b(i) =

\begin{cases}
f_o(i), & i \le i_c \\
f_g - f_o(i), & i_c < i
\end{cases}`} />

因此，V3 并不直接存储 `fee growth below`，而是改为在每个 tick 上存储一个更容易更新的量`feeGrowthOutside`，后续再根据当前价格相对 tick <InlineMath tex={String.raw`i`} /> 的位置，恢复出： <InlineMath tex={String.raw`f_b(i)`} /> 和 <InlineMath tex={String.raw`f_a(i)`} />，接下来我们将继续 <InlineMath tex={String.raw`f_a(i)`} /> 的介绍。

## 6. Fee Growth Above（上方累计）

我们同样关注一个固定的 tick：<InlineMath tex={String.raw`i`} />。我们定义：

<MathBlock tex={String.raw`f_a(i) = \text{fee growth above tick } i`} />

![Diagram 20260422111523](/img/notes/pasted-image-20260422111523.png)

从图中可以看到：

- 绿色折线表示全局 fee growth <InlineMath tex={String.raw`f_g`} />
- 红色区域表示在 tick <InlineMath tex={String.raw`i`} /> 上方产生的 fee

随着时间推进：

- 当价格在 tick <InlineMath tex={String.raw`i`} /> 右侧时，新的 fee 会被计入 “above”
- 当价格在 tick <InlineMath tex={String.raw`i`} /> 左侧时，新的 fee 不属于 above

因此，<InlineMath tex={String.raw`f_a(i)`} /> 本质上是所有发生在 tick <InlineMath tex={String.raw`i`} /> 上方的 fee 的累计。

和 below 一样：

- price crossing tick i 时
- “above / below”的归属会发生翻转

因此，<InlineMath tex={String.raw`f_a(i)`} /> 也不是一个可以简单线性累加的量

从时间展开观察规律（仅用于理解）

设：

<MathBlock tex={String.raw`t_0 < t_1 < t_2 < t_3 < t_4`} />

可以得到：

---

#### 🔹 t₀（价格在 i 右边）

- 所有 fee 都在 i 上方
- 计算上方 fee

<MathBlock tex={String.raw`f_a(t_0) = f_g - f_{g0}`} />

---

#### 🔹 t₁（价格从 右 → 左 穿过 i）

- above / below 发生交换

<MathBlock tex={String.raw`f_a(t_1) = f_{g1} - f_{g0}`} />

---

#### 🔹 t₂（价格 左 → 右 穿过 i）

- 新产生的 fee 属于 above

<MathBlock tex={String.raw`f_a(t_2) = f_g - f_{g2} + f_{g1} - f_{g0}`} />

---

#### 🔹 t₃（价格从 右 → 左 穿过 i）

- 再次发生翻转

<MathBlock tex={String.raw`f_a(t_3) = f_{g3} - f_{g2} + f_{g1} - f_{g0}`} />

---

#### 🔹 t₄（价格 左 → 右 穿过 i）

<MathBlock tex={String.raw`f_a(t_4) = f_g - f_{g4} + f_{g3} - f_{g2} + f_{g1} - f_{g0}`} />

---
从这些展开可以观察到：

- 和 below 一样，每 crossing 一次 tick，就发生一次符号翻转
- 非 crossing 时，只是继续累加

因此，这些展开式只是用于帮助理解“翻转机制”，实际计算不会使用这些表达式，而是用 feeGrowthOutside 表示 above。

我们已经定义：

<MathBlock tex={String.raw`f_o(i)`} />

表示 tick 上记录的 `feeGrowthOutside`

设：

<MathBlock tex={String.raw`i_c = \text{current price tick}`} />

其中，<InlineMath tex={String.raw`i_c`} /> 表示当前价格所在 tick。

则：

<MathBlock tex={String.raw`f_a(i) =

\begin{cases}
f_g - f_o(i), & i \le i_c \\
f_o(i), & i_c < i
\end{cases}`} />

因此 above 并不是独立设计的量，而是通过 feeGrowthOutside + 当前价格位置恢复得到。below / above 本质是同一个东西的两种视角，而发生 crossing 时会导致“归属翻转”，另外 V3 不存 below / above，只存<InlineMath tex={String.raw`f_o(i)`} />  。并通过当前价格位置恢复：<InlineMath tex={String.raw`f_b(i)`} /> 和 <InlineMath tex={String.raw`f_a(i)`} />

## 7. `feeGrowthOutside` 的初始化与更新

在上一节中，我们已经看到：

- `feeGrowthBelow` 和 `feeGrowthAbove` 都不是简单的线性累加量
- 它们会随着价格 crossing tick 而发生“归属翻转”
- 如果直接按历史定义去维护，链上需要遍历所有历史 swap，gas 成本无法接受

因此，V3 并不会直接存储：

- `f_b(i)`：tick `i` 下方的累计 fee growth
- `f_a(i)`：tick `i` 上方的累计 fee growth

而是为每一个初始化过的 tick，存储一个更容易维护的状态变量：

<MathBlock tex={String.raw`f_{out,i}`} />

表示 tick `i` 处记录的 `feeGrowthOutside`。这个变量的核心作用是用一个状态量，压缩和编码价格多次 crossing 该 tick 后的“翻转历史”。所以，后面我们并不是直接去算 <InlineMath tex={String.raw`f_b(i),\quad f_a(i)`} />

### 7.1 初始化规则

当一个 tick i 第一次被初始化时，我们需要决定当前为止，哪些 fee 属于 “outside”。

设当前价格所在 tick 为 <InlineMath tex={String.raw`i_c`} />，那么：

- 如果 <InlineMath tex={String.raw`i \le i_c`} />（tick 在当前价格左边）
- outside = 左边那一部分
- 所以：

<MathBlock tex={String.raw`f_{out,i} = f_g`} />

- 如果 <InlineMath tex={String.raw`i > i_c`} />（tick 在当前价格右边）
- outside 还没有任何累计
- 所以：

<MathBlock tex={String.raw`f_{out,i} = 0`} />

当价格穿过 tick i 时：

- 原本的 outside 区域变成 inside
- 原本的 inside 区域变成 outside

outside 的定义被“翻转”，根据前面推导：

<MathBlock tex={String.raw`f_{new} = f_g - f_{old}`} />

因此：

<MathBlock tex={String.raw`f_{out,i} = f_g - f_{out,i}`} />

这意味着 <InlineMath tex={String.raw`f_{out,i}`} /> 已经隐式记录了：

- tick 左侧 / 右侧的 fee 累计
- 以及多次 crossing 后的“翻转结果”

接下来我们要做的事情是用 <InlineMath tex={String.raw`f_{out,i}`} /> 恢复：

<MathBlock tex={String.raw`f_b(i), \quad f_a(i)`} />

从而进一步计算：

<MathBlock tex={String.raw`f_{\text{inside}}(i_{lower}, i_{upper})`} />

### 7.2 更新规则

对于一个 LP 区间 <InlineMath tex={String.raw`[i_{lower},\ i_{upper}]`} />，定义该区间内的 fee 为：

<MathBlock tex={String.raw`f(i_{lower}, i_{upper})

=
f_g - f_b(i_{lower}) - f_a(i_{upper})`} />

其中：

- <InlineMath tex={String.raw`f_g`} />：全局 fee growth
- <InlineMath tex={String.raw`f_b(i_{lower})`} />：下边界以下的 fee
- <InlineMath tex={String.raw`f_a(i_{upper})`} />：上边界以上的 fee

设当前价格所在 tick 为 <InlineMath tex={String.raw`i_c`} /> 时：

#### Fee below

<MathBlock tex={String.raw`f_b(i) =

\begin{cases}
f_{out,i}, & i \le i_c \\
f_g - f_{out,i}, & i_c < i
\end{cases}`} />

#### Fee above

<MathBlock tex={String.raw`f_a(i) =

\begin{cases}
f_g - f_{out,i}, & i \le i_c \\
f_{out,i}, & i_c < i
\end{cases}`} />

可以看到 fee inside 的计算，取决于：

- 当前价格位置 <InlineMath tex={String.raw`i_c`} />
- 相对于区间 <InlineMath tex={String.raw`[i_{lower}, i_{upper}]`} /> 的位置

因此需要分三种情况讨论：

1. 当前价格在区间左侧：<InlineMath tex={String.raw`i_c < i_{lower}`} />
2. 当前价格在区间内部：<InlineMath tex={String.raw`i_{lower} \le i_c \le i_{upper}`} />
3. 当前价格在区间右侧：<InlineMath tex={String.raw`i_{upper} < i_c`} />

### Case 1: <InlineMath tex={String.raw`i_c < i_{lower}`} />（价格在区间左侧）

![Diagram 20260422111633](/img/notes/pasted-image-20260422111633.png)

根据定义：

<MathBlock tex={String.raw`f = f_g - f_b(i_{lower}) - f_a(i_{upper})`} />

代入：

- 因为 <InlineMath tex={String.raw`i_c < i_{lower}`} />：

<MathBlock tex={String.raw`f_b(i_{lower}) = f_g - f_{out,i_{lower}}`} />

<MathBlock tex={String.raw`f_a(i_{upper}) = f_{out,i_{upper}}`} />

得到：

<MathBlock tex={String.raw`\begin{aligned}

f
&= f_g - (f_g - f_{out,i_{lower}}) - f_{out,i_{upper}} \\
&= f_{out,i_{lower}} - f_{out,i_{upper}}
\end{aligned}`} />

  ---

### Case 2: <InlineMath tex={String.raw`i_{lower} \le i_c \le i_{upper}`} />（价格在区间内部）

![Diagram 20260422111654](/img/notes/pasted-image-20260422111654.png)

根据定义：

<MathBlock tex={String.raw`f = f_g - f_b(i_{lower}) - f_a(i_{upper})`} />

代入：

- 因为 <InlineMath tex={String.raw`i_{lower} \le i_c`} />

<MathBlock tex={String.raw`f_b(i_{lower}) = f_{out,i_{lower}}`} />

- 因为 <InlineMath tex={String.raw`i_c \le i_{upper}`} />

<MathBlock tex={String.raw`f_a(i_{upper}) = f_{out,i_{upper}}`} />

得到：

<MathBlock tex={String.raw`f = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

---

### Case 3：<InlineMath tex={String.raw`i_{upper} < i_c`} />（价格在区间右侧）

![Diagram 20260422111712](/img/notes/pasted-image-20260422111712.png)

根据定义：

<MathBlock tex={String.raw`f = f_g - f_b(i_{lower}) - f_a(i_{upper})`} />

代入：

- 因为 <InlineMath tex={String.raw`i_{upper} < i_c`} />

<MathBlock tex={String.raw`f_b(i_{lower}) = f_{out,i_{lower}}`} />

<MathBlock tex={String.raw`f_a(i_{upper}) = f_g - f_{out,i_{upper}}`} />

得到：

<MathBlock tex={String.raw`\begin{aligned}

f
&= f_g - f_{out,i_{lower}} - (f_g - f_{out,i_{upper}}) \\
&= f_{out,i_{upper}} - f_{out,i_{lower}}
\end{aligned}`} />

三种情况统一为：

<MathBlock tex={String.raw`f(i_{lower}, i_{upper}) =

\begin{cases}
f_{out,i_{lower}} - f_{out,i_{upper}}, & i_c < i_{lower} \\
f_g - f_{out,i_{lower}} - f_{out,i_{upper}}, & i_{lower} \le i_c \le i_{upper} \\
f_{out,i_{upper}} - f_{out,i_{lower}}, & i_{upper} < i_c
\end{cases}`} />

## 8. 未初始化 tick 下的累计手续费计算

在上一节中，我们已经得到了统一的区间 fee 表达式：

<MathBlock tex={String.raw`f(i_{lower}, i_{upper}) =

\begin{cases}
f_{out,i_{lower}} - f_{out,i_{upper}}, & i_c < i_{lower} \\
f_g - f_{out,i_{lower}} - f_{out,i_{upper}}, & i_{lower} \le i_c \le i_{upper} \\
f_{out,i_{upper}} - f_{out,i_{lower}}, & i_{upper} < i_c
\end{cases}`} />

接下来我们考虑一个特殊但非常重要的情况：

> 区间边界 <InlineMath tex={String.raw`i_{lower}, i_{upper}`} /> 在 position 创建时均未被 initialize

这意味着在创建时刻 <InlineMath tex={String.raw`t_0`} />：

<MathBlock tex={String.raw`f_{out,i_{lower}} = 0, \quad f_{out,i_{upper}} = 0`} />

同时定义：

<MathBlock tex={String.raw`F_0 = f(i_{lower}, i_{upper}) \text{ at } t_0`} />

<MathBlock tex={String.raw`F_k = f(i_{lower}, i_{upper}) \text{ at } t_k`} />

目标是计算：

<MathBlock tex={String.raw`F_k - F_0`} />

---

### Case 1：<InlineMath tex={String.raw`i_c < i_{lower}`} />（价格始终在区间左侧）

![Diagram 20260422111739](/img/notes/pasted-image-20260422111739.png)

此时使用公式：

<MathBlock tex={String.raw`f = f_{out,i_{lower}} - f_{out,i_{upper}}`} />

#### 初始时刻 <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = 0 - 0 = 0`} />

#### 某一时刻 <InlineMath tex={String.raw`t_2`} />

假设价格在 <InlineMath tex={String.raw`t_1`} /> 时首次穿过 <InlineMath tex={String.raw`i_{lower}`} />，则：

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_{g1}`} />

而 <InlineMath tex={String.raw`i_{upper}`} /> 仍未被触及：

<MathBlock tex={String.raw`f_{out,i_{upper}} = 0`} />

因此：

<MathBlock tex={String.raw`F_2 = f_{g2} - (f_{g1} - 0) - 0 = f_{g2} - f_{g1}`} />

得到：

<MathBlock tex={String.raw`F_2 - F_0 = f_{g2} - f_{g1}`} />

---

### Case 2：<InlineMath tex={String.raw`i_{lower} \le i_c \le i_{upper}`} />（价格进入区间内部）

![Diagram 20260422111759](/img/notes/pasted-image-20260422111759.png)

使用公式：

<MathBlock tex={String.raw`f = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

#### 初始时刻 <InlineMath tex={String.raw`t_0`} />

由于两个 tick 都未初始化：

<MathBlock tex={String.raw`F_0 = f_{g0} - f_{g0} - 0 = 0`} />

#### 某一时刻 <InlineMath tex={String.raw`t_2`} />

假设：

- <InlineMath tex={String.raw`i_{lower}`} /> 已被穿过（在 <InlineMath tex={String.raw`t_1`} />）
- <InlineMath tex={String.raw`i_{upper}`} /> 尚未穿过

则：

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_{g0}, \quad f_{out,i_{upper}} = 0`} />

因此：

<MathBlock tex={String.raw`F_2 = f_{out,i_{upper}} - f_{out,i_{lower}} = f_{g1} - f_{g0}`} />

得到：

<MathBlock tex={String.raw`F_2 - F_0 = f_{g1} - f_{g0}`} />

---

### Case 3：<InlineMath tex={String.raw`i_{upper} < i_c`} />（价格穿过整个区间）

![Diagram 20260422111821](/img/notes/pasted-image-20260422111821.png)

使用公式：

<MathBlock tex={String.raw`f = f_{out,i_{upper}} - f_{out,i_{lower}}`} />

#### 初始时刻 <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = 0`} />

#### 某一时刻 <InlineMath tex={String.raw`t_2`} />

假设：

- <InlineMath tex={String.raw`i_{lower}`} /> 在 <InlineMath tex={String.raw`t_0`} /> 之前已初始化
- <InlineMath tex={String.raw`i_{upper}`} /> 在 <InlineMath tex={String.raw`t_1`} /> 被穿过

则：

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_{g0}, \quad f_{out,i_{upper}} = f_{g1}`} />

因此：

<MathBlock tex={String.raw`F_2 = f_{g2} - f_{g0} - (f_{g1} - f_{g0}) = f_{g2} - f_{g1}`} />

得到：

<MathBlock tex={String.raw`F_2 - F_0 = f_{g2} - f_{g1}`} />

---

无论当前价格相对于区间的位置如何（左侧 / 内部 / 右侧），在边界 tick 初始未被 initialize 的情况下，都有：

<MathBlock tex={String.raw`F_k - F_0 = f_{g,k} - f_{g,\text{entry}}`} />

- 在 tick 尚未初始化之前，区间边界并没有形成“分割”
- 因此 fee growth 不会被分配到 outside
- 整个区间的 fee accumulation 等价于 global fee growth 的变化

## 9. lower 已初始化，upper 未初始化

在上一节中，我们分析了两个 tick 都未初始化，现在我们进入一个更关键的中间态：

> **<InlineMath tex={String.raw`i_{lower}`} /> 已初始化，<InlineMath tex={String.raw`i_{upper}`} /> 尚未初始化**

初始状态（position 创建时）

设 position 创建于 <InlineMath tex={String.raw`t_0`} />，当前价格为 <InlineMath tex={String.raw`i_c`} />

由于：

- <InlineMath tex={String.raw`i_{lower}`} /> 已初始化
- <InlineMath tex={String.raw`i_{upper}`} /> 未初始化

因此：

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_L \neq 0`} />

<MathBlock tex={String.raw`f_{out,i_{upper}} = 0`} />

其中：

<MathBlock tex={String.raw`f_L = f_{out,i_{lower}} \text{ at } t_0`} />

定义：

<MathBlock tex={String.raw`F_0 = f(i_{lower}, i_{upper}) \text{ at } t_0`} />

<MathBlock tex={String.raw`F_k = f(i_{lower}, i_{upper}) \text{ at } t_k`} />

目标仍然是：

<MathBlock tex={String.raw`F_k - F_0`} />

---

## Case 1：<InlineMath tex={String.raw`i_c < i_{lower}`} />（价格在区间左侧）

![Diagram 20260422111851](/img/notes/pasted-image-20260422111851.png)

此时：

<MathBlock tex={String.raw`f = f_{out,i_{lower}} - f_{out,i_{upper}}`} />

初始时刻 <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = f_L - 0 = f_L`} />

某一时刻 <InlineMath tex={String.raw`t_2`} />

价格在 <InlineMath tex={String.raw`t_1`} /> 时穿过 <InlineMath tex={String.raw`i_{lower}`} />，发生一次 flip：

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_g - f_{out,i_{lower}}`} />

即：

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_{g1} - f_L`} />

而：

<MathBlock tex={String.raw`f_{out,i_{upper}} = 0`} />

因此：

<MathBlock tex={String.raw`F_2 = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

代入：

<MathBlock tex={String.raw`F_2 = f_{g2} - (f_{g1} - f_L) - 0`} />

差值

<MathBlock tex={String.raw`\begin{aligned}

F_2 - F_0
&= f_{g2} - (f_{g1} - f_L) - f_L \\
&= f_{g2} - f_{g1}
\end{aligned}`} />

---

## Case 2：<InlineMath tex={String.raw`i_{lower} \le i_c \le i_{upper}`} />（价格进入区间内部）

![Diagram 20260422111911](/img/notes/pasted-image-20260422111911.png)

此时：

<MathBlock tex={String.raw`f = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

初始时刻 <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = f_{g0} - f_L - 0`} />

某一时刻 <InlineMath tex={String.raw`t_2`} />

此时：

- <InlineMath tex={String.raw`i_{lower}`} /> 已被穿过（或本就在左侧）
- <InlineMath tex={String.raw`i_{upper}`} /> 尚未被触及

因此：

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_L`} />

<MathBlock tex={String.raw`f_{out,i_{upper}} = 0`} />

<MathBlock tex={String.raw`F_2 = f_{out,i_{upper}} - f_{out,i_{lower}}`} />

<MathBlock tex={String.raw`F_2 = f_{g1} - f_L`} />

差值

<MathBlock tex={String.raw`\begin{aligned}

F_2 - F_0
&= (f_{g1} - f_L) - (f_{g0} - f_L) \\
&= f_{g1} - f_{g0}
\end{aligned}`} />

---

## Case 3：<InlineMath tex={String.raw`i_{upper} < i_c`} />（价格穿过 upper）

![Diagram 20260422111929](/img/notes/pasted-image-20260422111929.png)

此时：

<MathBlock tex={String.raw`f = f_{out,i_{upper}} - f_{out,i_{lower}}`} />

初始时刻 <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = f_{g0} - f_L`} />

某一时刻 <InlineMath tex={String.raw`t_2`} />

假设：

- <InlineMath tex={String.raw`i_{upper}`} /> 在 <InlineMath tex={String.raw`t_1`} /> 被首次穿过（初始化）
- 同时发生 flip：

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_{g1}`} />

因此：

<MathBlock tex={String.raw`F_2 = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

代入：

<MathBlock tex={String.raw`F_2 = f_{g2} - f_L - (f_{g1} - f_{g0})`} />

差值

<MathBlock tex={String.raw`\begin{aligned}

F_2 - F_0
&= f_{g2} - f_L - (f_{g1} - f_{g0}) - (f_{g0} - f_L) \\
&= f_{g2} - f_{g1}
\end{aligned}`} />

---
这一节说明：只要 upper 还未初始化，区间“右边界”不会截断 fee“。

因此：

- fee 仍然只被 lower 截断一次
- 整体效果仍然等价于：

<MathBlock tex={String.raw`\Delta f_{\text{inside}} = \Delta f_g`} />

## 10. upper 已初始化，lower 未初始化

在上一节中，我们分析了 **<InlineMath tex={String.raw`i_{lower}`} /> 已初始化，<InlineMath tex={String.raw`i_{upper}`} /> 未初始化，现在我们考虑完全对称的情况：

> <InlineMath tex={String.raw`i_{upper}`} /> 已初始化，<InlineMath tex={String.raw`i_{lower}`} /> 未初始化

初始状态（position 创建时）

设 position 创建于 <InlineMath tex={String.raw`t_0`} />，当前价格为 <InlineMath tex={String.raw`i_c`} />

由于：

- <InlineMath tex={String.raw`i_{lower}`} /> 未初始化
- <InlineMath tex={String.raw`i_{upper}`} /> 已初始化

因此：

<MathBlock tex={String.raw`f_{out,i_{lower}} = 0`} />

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_U \neq 0`} />

其中：

<MathBlock tex={String.raw`f_U = f_{out,i_{upper}} \text{ at } t_0`} />

定义：

<MathBlock tex={String.raw`F_0 = f(i_{lower}, i_{upper}) \text{ at } t_0`} />

<MathBlock tex={String.raw`F_k = f(i_{lower}, i_{upper}) \text{ at } t_k`} />

目标仍然是：

<MathBlock tex={String.raw`F_k - F_0`} />

---

## Case 1：<InlineMath tex={String.raw`i_c < i_{lower}`} />（价格在区间左侧）

![Diagram 20260424103215](/img/notes/pasted-image-20260424103215.png)

此时：

<MathBlock tex={String.raw`f = f_{out,i_{lower}} - f_{out,i_{upper}}`} />

初始时刻 <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = 0 - f_U`} />

某一时刻 <InlineMath tex={String.raw`t_2`} />

价格在 <InlineMath tex={String.raw`t_1`} /> 时穿过 <InlineMath tex={String.raw`i_{lower}`} />（首次初始化）：

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_{g1}`} />

而：

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_U`} />

因此：

<MathBlock tex={String.raw`F_2 = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

代入：

<MathBlock tex={String.raw`F_2 = f_{g2} - f_{g1} - f_U`} />

差值

<MathBlock tex={String.raw`\begin{aligned}

F_2 - F_0
&= (f_{g2} - f_{g1} - f_U) - (0 - f_U) \\
&= f_{g2} - f_{g1}
\end{aligned}`} />

---

## Case 2：<InlineMath tex={String.raw`i_{lower} \le i_c \le i_{upper}`} />（价格在区间内部）

![Diagram 20260424103229](/img/notes/pasted-image-20260424103229.png)

此时：

<MathBlock tex={String.raw`f = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

初始时刻 <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = f_{g0} - 0 - f_U`} />

某一时刻 <InlineMath tex={String.raw`t_2`} />

此时：

- <InlineMath tex={String.raw`i_{lower}`} /> 尚未初始化
- <InlineMath tex={String.raw`i_{upper}`} /> 已存在

因此：

<MathBlock tex={String.raw`f_{out,i_{lower}} = 0`} />

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_U`} />

<MathBlock tex={String.raw`F_2 = f_{out,i_{upper}} - f_{out,i_{lower}}`} />

<MathBlock tex={String.raw`F_2 = f_{g1} - f_U`} />

差值

<MathBlock tex={String.raw`\begin{aligned}

F_2 - F_0
&= (f_{g1} - f_U) - (f_{g0} - f_U) \\
&= f_{g1} - f_{g0}
\end{aligned}`} />

---

## Case 3：<InlineMath tex={String.raw`i_{upper} < i_c`} />（价格在区间右侧）

![Diagram 20260424103243](/img/notes/pasted-image-20260424103243.png)

此时：

<MathBlock tex={String.raw`f = f_{out,i_{upper}} - f_{out,i_{lower}}`} />

初始时刻 <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = f_U - 0 = f_U`} />

某一时刻 <InlineMath tex={String.raw`t_2`} />

价格在 <InlineMath tex={String.raw`t_1`} /> 时穿过 <InlineMath tex={String.raw`i_{upper}`} />，发生 flip：

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_g - f_{out,i_{upper}}`} />

即：

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_{g1} - f_U`} />

因此：

<MathBlock tex={String.raw`F_2 = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

代入：

<MathBlock tex={String.raw`F_2 = f_{g2} - 0 - (f_{g1} - f_U)`} />

差值

<MathBlock tex={String.raw`\begin{aligned}

F_2 - F_0
&= (f_{g2} - f_{g1} + f_U) - f_U \\
&= f_{g2} - f_{g1}
\end{aligned}`} />

这一节与上一节形成完全对称关系：

- lower 初始化 → 截断左侧 fee
- upper 初始化 → 截断右侧 fee

但只要另一侧未初始化：区间仍然没有形成“完整边界” 。

因此：

- fee 只被单侧截断
- 整体仍然等价于 global fee growth

## 11. lower 与 upper 都已初始化（完整区间）

在前面几节中，我们已经证明：

- 两侧都未初始化 → 等价 global
- only lower → 等价 global
- only upper → 等价 global

现在进入**最后一种情况**：

> **<InlineMath tex={String.raw`i_{lower}`} /> 与 <InlineMath tex={String.raw`i_{upper}`} /> 都已初始化**

初始状态（position 创建时）

设 position 创建于 <InlineMath tex={String.raw`t_0`} />，当前价格为 <InlineMath tex={String.raw`i_c`} />

此时：

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_L`} />

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_U`} />

其中：

<MathBlock tex={String.raw`f_L = f_{out,i_{lower}} \text{ at } t_0`} />

<MathBlock tex={String.raw`f_U = f_{out,i_{upper}} \text{ at } t_0`} />

定义：

<MathBlock tex={String.raw`F_0 = f(i_{lower}, i_{upper}) \text{ at } t_0`} />

<MathBlock tex={String.raw`F_k = f(i_{lower}, i_{upper}) \text{ at } t_k`} />

目标：

<MathBlock tex={String.raw`F_k - F_0`} />

---

## Case 1：<InlineMath tex={String.raw`i_c < i_{lower}`} />（价格在区间左侧）

![Diagram 20260424102554](/img/notes/pasted-image-20260424102554.png)

此时：

<MathBlock tex={String.raw`f = f_{out,i_{lower}} - f_{out,i_{upper}}`} />

初始时刻 <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = f_L - f_U`} />

某一时刻 <InlineMath tex={String.raw`t_2`} />

价格在 <InlineMath tex={String.raw`t_1`} /> 时穿过 <InlineMath tex={String.raw`i_{lower}`} />，发生 flip：

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_g - f_{out,i_{lower}} = f_{g1} - f_L`} />

而：

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_U`} />

<MathBlock tex={String.raw`F_2 = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

代入：

<MathBlock tex={String.raw`F_2 = f_{g2} - (f_{g1} - f_L) - f_U`} />

差值

<MathBlock tex={String.raw`\begin{aligned}

F_2 - F_0
&= f_{g2} - (f_{g1} - f_L) - f_U - (f_L - f_U) \\
&= f_{g2} - f_{g1}
\end{aligned}`} />

---

## Case 2：<InlineMath tex={String.raw`i_{lower} \le i_c \le i_{upper}`} />（价格在区间内部）

![Diagram 20260424102701](/img/notes/pasted-image-20260424102701.png)

此时：

<MathBlock tex={String.raw`f = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

初始时刻 <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = f_{g0} - f_L - f_U`} />

某一时刻 <InlineMath tex={String.raw`t_2`} />

此时：

- lower 在左侧
- upper 在右侧

因此：

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_L`} />

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_U`} />

<MathBlock tex={String.raw`F_2 = f_{out,i_{upper}} - f_{out,i_{lower}}`} />

<MathBlock tex={String.raw`F_2 = f_{g1} - f_U - f_L`} />

差值

<MathBlock tex={String.raw`\begin{aligned}

F_2 - F_0
&= (f_{g1} - f_U - f_L) - (f_{g0} - f_L - f_U) \\
&= f_{g1} - f_{g0}
\end{aligned}`} />

---

## Case 3：<InlineMath tex={String.raw`i_{upper} < i_c`} />（价格在区间右侧）

![Diagram 20260424102846](/img/notes/pasted-image-20260424102846.png)

此时：

<MathBlock tex={String.raw`f = f_{out,i_{upper}} - f_{out,i_{lower}}`} />

初始时刻 <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = f_U - f_L`} />

某一时刻 <InlineMath tex={String.raw`t_2`} />

价格在 <InlineMath tex={String.raw`t_1`} /> 时穿过 <InlineMath tex={String.raw`i_{upper}`} />，发生 flip：

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_{g1} - f_U`} />

<MathBlock tex={String.raw`F_2 = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

代入：

<MathBlock tex={String.raw`F_2 = f_{g2} - f_L - (f_{g1} - f_U)`} />

差值

<MathBlock tex={String.raw`\begin{aligned}

F_2 - F_0
&= f_{g2} - f_L - (f_{g1} - f_U) - (f_U - f_L) \\
&= f_{g2} - f_{g1}
\end{aligned}`} />
