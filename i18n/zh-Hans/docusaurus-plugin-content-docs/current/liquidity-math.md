---
id: liquidity-math
title: 01 Liquidity 数学表达式
sidebar_label: 01 Liquidity 数学表达式
---

import InlineMath from '@site/src/components/InlineMath';
import MathBlock from '@site/src/components/MathBlock';

## 概述

在 Uniswap V3 协议纵览中，我们从宏观上理解了 V3 的核心思想，包括：

- 流动性不再分布在整个价格区间 <InlineMath tex={String.raw`(0, \infty)`} />
- 而是集中在一个有限区间 <InlineMath tex={String.raw`[p_{\text{lower}}, p_{\text{upper}}]`} /> 内
- 并通过引入 virtual liquidity，使局部曲线仍然满足恒定乘积关系

<MathBlock tex={String.raw`(x_R + x_V)(y_R + y_V) = L^2`} />

然而，这个表达仍然是静态的。在真实的交易过程中，价格会不断变化，而流动性如何影响价格？资产数量如何随价格变化？  这些问题，都需要更精细的数学描述。

本章从 `Liquidity` 的角度出发，系统回答以下几个关键问题：

### 1. 不同价格位置下的资产状态

当价格 <InlineMath tex={String.raw`P`} /> 位于不同区间时：

- <InlineMath tex={String.raw`P < p_{\text{lower}}`} />：只持有 token0
- <InlineMath tex={String.raw`p_{\text{lower}} < P < p_{\text{upper}}`} />：双边资产
- <InlineMath tex={String.raw`P > p_{\text{upper}}`} />：只持有 token1

我们将推导在不同状态下：

<MathBlock tex={String.raw`x_R(P), \quad y_R(P)`} />

### 2. 全局流动性与区间流动性

- global liquidity（当前价格处的有效流动性）
- liquidity net（跨 tick 的变化量）

理解为什么流动性是“分段变化”的。

### 3. 虚拟储备与真实储备

- 如何计算 <InlineMath tex={String.raw`x_V, y_V`} />（虚拟资产）
- 如何计算 <InlineMath tex={String.raw`x_R, y_R`} />（真实资产）
- 它们在不同价格区间中的含义

### 4. 流动性 <InlineMath tex={String.raw`L`} /> 的计算

- 如何根据 token 数量计算 <InlineMath tex={String.raw`L`} />
- 如何根据 <InlineMath tex={String.raw`L`} /> 反推出 token 数量
- <InlineMath tex={String.raw`L`} /> 与价格的关系

通过这一章，我们将建立一个完整的认知在 Uniswap V3 中，价格的变化，本质上是由 liquidity 驱动的。  后续在分析 tick、swap、手续费计算等机制时，  这些公式将作为基础反复使用。

## 1. 不同价格位置下的资产状态

在 Uniswap V3 中，LP 提供的流动性只在区间 <InlineMath tex={String.raw`[p_{\text{lower}}, p_{\text{upper}}]`} /> 内生效。  随着价格 <InlineMath tex={String.raw`P`} /> 的变化，LP 持有的资产结构会发生变化。

![Diagram 20260331203007](/img/notes/pasted-image-20260331203007.png)

### 1.1 当 <InlineMath tex={String.raw`P > p_{\text{upper}}`} />（价格高于区间）

![Diagram 20260331203024](/img/notes/pasted-image-20260331203024.png)

此时，价格已经完全穿过 LP 区间。

可以观察到：

- 所有流动性都表现为 **token1（Y）**
- token0（X）为 0

即：

<MathBlock tex={String.raw`x_R = 0, \quad y_R > 0`} />

LP 的 token0 已经全部被卖出，换成了 token1

### 1.2 当 <InlineMath tex={String.raw`P < p_{\text{lower}}`} />（价格低于区间）

![Diagram 20260331203042](/img/notes/pasted-image-20260331203042.png)

此时，价格离开 LP 的做市区间。

可以观察到：

- 所有流动性都表现为 **token0（X）**
- token1（Y）为 0

即：

<MathBlock tex={String.raw`x_R > 0, \quad y_R = 0`} />

从曲线上看，此时状态点停留在区间的左边界。LP 提供的是“等待被买入的 token0”

### 1.3 当 <InlineMath tex={String.raw`p_{\text{lower}} < P < p_{\text{upper}}`} />（价格在区间内）

![Diagram 20260331203230](/img/notes/pasted-image-20260331203230.png)

此时，流动性处于 active 状态。

随着价格移动：

- token0（X）逐渐减少
- token1（Y）逐渐增加

即：

<MathBlock tex={String.raw`x_R > 0, \quad y_R > 0`} />

并且满足：

<MathBlock tex={String.raw`(x_R + x_V)(y_R + y_V) = L^2`} />

可以将流动性状态总结为三段：

<MathBlock tex={String.raw`\begin{cases}

P < p_{\text{lower}} & \Rightarrow (x_R > 0, \; y_R = 0) \\
p_{\text{lower}} < P < p_{\text{upper}} & \Rightarrow (x_R > 0, \; y_R > 0) \\
P > p_{\text{upper}} & \Rightarrow (x_R = 0, \; y_R > 0)
\end{cases}`} />

流动性并不是“同时提供两种资产”，而是随着价格变化，在 token0 与 token1 之间不断转换。价格的移动，本质上是 LP 资产在 X 与 Y 之间的再分配过程。

## 2. 全局流动性与区间流动性

在 Uniswap V3 中，每一个 LP position 都只在区间 <InlineMath tex={String.raw`[p_{\text{lower}}, p_{\text{upper}}]`} /> 内提供流动性。  然而，Pool 并不会逐个 position 去计算当前流动性，而是维护一个全局状态：

<MathBlock tex={String.raw`L = \text{current active liquidity}`} />

![Diagram 20260331221555](/img/notes/pasted-image-20260331221555.png)

在每一个 price（实际应该用 tick 表示，这里用 price 为了方便理解） 上，协议并不会存储完整的流动性分布，而是记录一个关键变量 `liquidityNet`。它表示当价格穿过该 price（`tick`） 时，全局流动性的净变化量。

当价格 <InlineMath tex={String.raw`P`} /> 发生变化时，Pool 会根据价格移动方向，对流动性进行更新：

### 2.1 当价格向右（上涨）：

![Diagram 20260331222511](/img/notes/pasted-image-20260331222511.png)

- <InlineMath tex={String.raw`p0`} />  `liquidity` 为初始值， <InlineMath tex={String.raw`L = 0`} />
- <InlineMath tex={String.raw`p1`} />  当 price 进入区间  <InlineMath tex={String.raw`[p_{\text{lower}}, p_{\text{upper}}]`} /> 开始添加 `liquidityNet`，<InlineMath tex={String.raw`L + \Delta L = 0 + \Delta L = \Delta L`} />
- <InlineMath tex={String.raw`p2`} />  当 price 继续上涨，向右移动到中间，当前 `liquidity` 仍然为区间内储存的  <InlineMath tex={String.raw`\Delta L`} />
- <InlineMath tex={String.raw`p3`} />  当 price 上涨到 <InlineMath tex={String.raw`p_{\text{upper}}`} /> 边界，已经离开区间。`liquidity` 减少区间内的流动性，<InlineMath tex={String.raw`L = 0`} />

### 2.2 当价格向左（下降）：

![Diagram 20260331222535](/img/notes/pasted-image-20260331222535.png)

- <InlineMath tex={String.raw`p4`} />  `liquidity` 为初始值， <InlineMath tex={String.raw`L = 0`} />
- <InlineMath tex={String.raw`p3`} />  当 price 进入区间  <InlineMath tex={String.raw`[p_{\text{lower}}, p_{\text{upper}}]`} /> 开始添加 `liquidityNet`，<InlineMath tex={String.raw`L + \Delta L = 0 -(-\Delta L) = \Delta L`} />
- <InlineMath tex={String.raw`p2`} />  当 price 继续下降，向左移动到中间，当前 `liquidity` 仍然为区间内储存的  <InlineMath tex={String.raw`\Delta L`} />
- <InlineMath tex={String.raw`p0`} />  当 price 下降到 <InlineMath tex={String.raw`p_{\text{lower}}`} /> 边界，已经离开区间。`liquidity` 减少区间内的流动性，<InlineMath tex={String.raw`L = 0`} />

### 2.3 区间流动性的叠加

![Diagram 20260331223855](/img/notes/pasted-image-20260331223855.png)

如果将多个 LP position 放在同一个价格轴上，可以得到如图所示的流动性分布。

当多个 position 叠加时：

- 在同一个价格区间内，流动性会累加
- 在边界处，流动性会发生跳变

- <InlineMath tex={String.raw`p0:`} /> liquidity 为初始值，<InlineMath tex={String.raw`L = 0`} />

- <InlineMath tex={String.raw`p1:`} /> 价格上涨，进入第一个流动性区间，开始添加 `liquidityNet`，<InlineMath tex={String.raw`L + 100 = 100`} />

- <InlineMath tex={String.raw`p2:`} /> 继续移动，进入第二个区间，<InlineMath tex={String.raw`L + 150 = 250`} />

- <InlineMath tex={String.raw`p3:`} /> 离开第二个区间，<InlineMath tex={String.raw`L - 150 = 100`} />

- <InlineMath tex={String.raw`p4:`} /> 离开第一个区间，<InlineMath tex={String.raw`L - 100 = 0`} />

- <InlineMath tex={String.raw`p5:`} /> 离开所有区间，liquidity = 0

因此，流动性是由一组分布在 price（`tick`） 上的 `liquidityNet` 决定。当价格 <InlineMath tex={String.raw`P`} /> 发生变化时，Pool 的行为可以抽象为在 tick 轴上沿价格方向进行一次扫描，并逐个应用 `liquidityNet`。

因此，全局流动性可以表示为：

<MathBlock tex={String.raw`L(P) = \sum_{\text{ticks crossed}} liquidityNet`} />

## 3. 虚拟储备与真实储备

### 3.1 虚拟储备

在 V3 中区间流动性不再是全局分布，而是集中在有限区间内。但这段曲线本身并不是独立存在的，而是嵌入在一条更完整的 AMM 曲线之中。为了仍然维持连续且一致的价格函数，V3 引入了 virtual liquidity。其本质是在 x 和 y 方向引入偏移量`x_virtual, y_virtual`，将当前的真实状态 `(x, y)` 嵌入到一个更大的坐标系中，从而使该状态仍然落在一条完整的 AMM 曲线上。

![Diagram 20260401110511](/img/notes/pasted-image-20260401110511.png)

在图片中我们可以看到：

- <InlineMath tex={String.raw`x_0`} />：当价格位于 <InlineMath tex={String.raw`P_{\text{lower}}`} />（下界）时，该 position 的全部真实 token0 数量
- <InlineMath tex={String.raw`y_0`} />：当价格位于 <InlineMath tex={String.raw`P_{\text{upper}}`} />（上界）时，该 position 的全部真实 token1 数量

- `virtual x` 是 `token 0` 的数量
- `virtual y` 是 `token 1` 的数量

因此，当 price 在区间内时，<InlineMath tex={String.raw`X`} /> 的真实储备是大于 0，且小于 <InlineMath tex={String.raw`x_0`} /> （若大于 <InlineMath tex={String.raw`x_0`} /> ，则是另外一个区间）
同理，<InlineMath tex={String.raw`Y`} /> 的真实储备也是大于 0，且小于 <InlineMath tex={String.raw`y_0`} /> （若大于 <InlineMath tex={String.raw`y_0`} />， 则是另外一个区间）

需要注意的是，<InlineMath tex={String.raw`x_V`} /> 和 <InlineMath tex={String.raw`y_V`} /> 并不是任意引入的偏移量。它们之所以能够被唯一确定，是因为它们本身仍然属于完整恒定乘积曲线上的坐标量，为了使当前真实状态 <InlineMath tex={String.raw`(x_R, y_R)`} /> 仍然落在一条完整的恒定乘积曲线上，我们要求：

<MathBlock tex={String.raw`(x_R + x_V)(y_R + y_V) = L^2`} />

其中，<InlineMath tex={String.raw`x_V, y_V`} /> 是需要求解的虚拟储备。

第一步：写出完整曲线上的坐标关系

对于完整曲线：

<MathBlock tex={String.raw`XY = L^2`} />

价格定义为：

<MathBlock tex={String.raw`P = \frac{Y}{X}`} />

联立可得：

<MathBlock tex={String.raw`X = \frac{L}{\sqrt{P}}, \qquad Y = L\sqrt{P}`} />

> 化简过程：

> <MathBlock tex={String.raw`\frac{L^2}{P} = \frac{XY}{\frac{Y}{X}} = X^2     => X = \frac{L}{\sqrt{P}}`} />

>

> <MathBlock tex={String.raw`L^2 P = XY \cdot \frac{Y}{X} = Y^2   => Y = L\sqrt{P}`} />

这意味着，在价格为 <InlineMath tex={String.raw`P`} /> 时，完整曲线上的横纵坐标分别可以表示为以上公式。

第二步：利用边界条件求 <InlineMath tex={String.raw`x_V`} /> （后续都用 <InlineMath tex={String.raw`P_B`} /> 表示 `P upper`，<InlineMath tex={String.raw`P_A`} /> 表示 <InlineMath tex={String.raw`P_{\text{lower}}`} />）

当价格达到上界 <InlineMath tex={String.raw`P_{\text{upper}}`} /> 时，该 position 已经完全转化为 token1，因此：

<MathBlock tex={String.raw`x_R = 0`} />

此时，完整曲线上的横坐标仅由虚拟部分构成，所以：

<MathBlock tex={String.raw`x_V(y_R + y_V) = L^2`} />

<MathBlock tex={String.raw`x_V = \frac {L^2}{y_R + y_V}`} />

<MathBlock tex={String.raw`x_V = \frac{L^2}{L\sqrt{P_B}}`} />

<MathBlock tex={String.raw`x_V = \frac{L}{\sqrt{P_B}}`} />

第三步：利用边界条件求 <InlineMath tex={String.raw`y_V`} />

当价格达到下界 <InlineMath tex={String.raw`P_{\text{lower}}`} /> 时，该 position 已经完全转化为 token0，因此：

<MathBlock tex={String.raw`y_R = 0`} />

此时，完整曲线上的纵坐标仅由虚拟部分构成，所以：

<MathBlock tex={String.raw`(x_R+x_V)y_V = L^2`} />

<MathBlock tex={String.raw`y_V =  \frac{L^2}{x_R+x_V}`} />

<MathBlock tex={String.raw`y_V = \frac{L^2}{\frac{L}{\sqrt{P_A}}}`} />

<MathBlock tex={String.raw`y_V = L\sqrt{P_A}`} />

第四步：将 <InlineMath tex={String.raw`x_V, y_V`} /> 代入主方程，可得：

<MathBlock tex={String.raw`\left(x_R + \frac{L}{\sqrt{P_B}}\right)\left(y_R + L\sqrt{P_A}\right)=L^2`} />

这就是 Uniswap V3 中 real reserves 与 virtual reserves 的核心关系式。

### 3.2 真实储备

在上一节中，我们通过引入虚拟储备，将当前状态 <InlineMath tex={String.raw`(x_R, y_R)`} /> 嵌入到完整曲线：

<MathBlock tex={String.raw`(x_R + x_V)(y_R + y_V) = L^2`} />

并求得：

<MathBlock tex={String.raw`x_V = \frac{L}{\sqrt{P_B}}, \qquad y_V = L\sqrt{P_A}`} />

![Diagram 20260401231214](/img/notes/pasted-image-20260401231214.png)

当价格在区间内移动时：

- 价格上升（<InlineMath tex={String.raw`P_{\text{lower}} \rightarrow P_{\text{upper}}`} />）：
- `token0` 被不断卖出
- `token1` 不断增加
- 最终变为纯 <InlineMath tex={String.raw`y_0`} />（即 <InlineMath tex={String.raw`x_0 = 0`} />）

<MathBlock tex={String.raw`\left( 0 + \frac{L}{\sqrt{P_B}} \right)

\left( {y_0} + L \sqrt{P_A} \right)
= L^2`} />

化简：

<MathBlock tex={String.raw`\frac{L}{\sqrt{P_B}} \left( y_0 + L \sqrt{P_A} \right) = L^2`} />

<MathBlock tex={String.raw`y_0 + L \sqrt{P_A} = L \sqrt{P_B}`} />

最终得到：

<MathBlock tex={String.raw`y_0 = L\sqrt{P} - L\sqrt{P_A}`} />

- 价格下降（<InlineMath tex={String.raw`P_{\text{upper}} \rightarrow P_{\text{lower}}`} />）：
- `token1` 被不断卖出
- `token0` 不断增加
- 最终变为纯 <InlineMath tex={String.raw`x_0`} />（即 <InlineMath tex={String.raw`y_0 = 0`} />）

<MathBlock tex={String.raw`\left( x_0 + \frac{L}{\sqrt{P_B}} \right)

\left( {0} + L \sqrt{P_A} \right)
= L^2`} />

化简：

<MathBlock tex={String.raw`\left( x_0 + \frac{L}{\sqrt{P_B}} \right)\sqrt{P_A} = L^2`} />

<MathBlock tex={String.raw`x_0 + \frac{L}{\sqrt{P_B}} = \frac{L}{\sqrt{P_A}}`} />

最终得到：

<MathBlock tex={String.raw`x_0 = \frac{L}{\sqrt{P}} - \frac{L}{\sqrt{P_B}}`} />

所以 <InlineMath tex={String.raw`x_0`} /> 和 <InlineMath tex={String.raw`y_0`} /> 是在区间两端，该 position 的“极限资产状态”。更重要的是，它们提供了将当前状态 <InlineMath tex={String.raw`(x_R, y_R)`} /> 与价格区间联系起来的边界条件。

总结

- virtual reserves：用于构造完整曲线
- real reserves：是当前价格下实际持有的资产

两者关系：

<MathBlock tex={String.raw`\text{real} = \text{global curve} - \text{virtual offset}`} />

这也是 Uniswap V3 将“局部流动性”嵌入“全局 AMM”的核心方式。

## 4. 流动性 <InlineMath tex={String.raw`L`} /> 的计算

在上一节中，我们已经得到真实储备：

<MathBlock tex={String.raw`x_R = \frac{L}{\sqrt{P}} - \frac{L}{\sqrt{P_B}}, \qquad

y_R = L\sqrt{P} - L\sqrt{P_A}`} />

这说明在 Uniswap V3 中，token 数量并不是直接存储的，而是由 <InlineMath tex={String.raw`L`} /> 和价格共同决定。

因此，我们可以做两件事：

- 已知 token 数量，反推 <InlineMath tex={String.raw`L`} />
- 已知 <InlineMath tex={String.raw`L`} />，计算 token 数量

这两者本质上是同一组公式的不同变形。

### 4.1 由 Token 数量计算 Liquidity

已知用户希望在区间 <InlineMath tex={String.raw`[P_{\text{lower}}, P_{\text{upper}}]`} /> 提供：

- <InlineMath tex={String.raw`x`} />（token0）
- <InlineMath tex={String.raw`y`} />（token1）

当前价格为 <InlineMath tex={String.raw`P_c`} />

---

### Case 1：<InlineMath tex={String.raw`P_c < P_A`} />（价格低于区间）

此时 position 完全是 token0：

<MathBlock tex={String.raw`L = x \cdot \frac{\sqrt{P_A} \cdot \sqrt{P_B}}{\sqrt{P_B} - \sqrt{P_A}}`} />

---

### Case 2：<InlineMath tex={String.raw`P_A \le P_c < P_B`} />（价格在区间内）

此时同时持有 token0 和 token1。

分别用两种 token 推导 liquidity：

<MathBlock tex={String.raw`L_0 = x \cdot \frac{\sqrt{P_c} \cdot \sqrt{P_B}}{\sqrt{P_B} - \sqrt{P_c}}`} />

<MathBlock tex={String.raw`L_1 = \frac{y}{\sqrt{P_c} - \sqrt{P_A}}`} />

最终取较小值（确保两种 token 都能满足）：

<MathBlock tex={String.raw`L = \min(L_0, L_1)`} />

---

### Case 3：<InlineMath tex={String.raw`P_c \ge P_B`} />（价格高于区间）

此时 position 完全是 token1：

<MathBlock tex={String.raw`L = \frac{y}{\sqrt{P_B} - \sqrt{P_A}}`} />

### 4.2 由 Liquidity 计算 Token 数量

已知：

- <InlineMath tex={String.raw`L`} />
- <InlineMath tex={String.raw`P_A, P_B`} />
- 当前价格 <InlineMath tex={String.raw`P_c`} />

先计算：

<MathBlock tex={String.raw`\sqrt{P_c}, \quad \sqrt{P_A}, \quad \sqrt{P_B}`} />

---

### Case 1：<InlineMath tex={String.raw`P_c < P_A`} />

全部为 token0：

<MathBlock tex={String.raw`\text{amount}_0 = L \cdot \left(\frac{1}{\sqrt{P_A}} - \frac{1}{\sqrt{P_B}}\right)`} />

<MathBlock tex={String.raw`\text{amount}_1 = 0`} />

---

### Case 2：<InlineMath tex={String.raw`P_A \le P_c < P_B`} />

同时持有两种 token：

<MathBlock tex={String.raw`\text{amount}_0 = L \cdot \left(\frac{1}{\sqrt{P_c}} - \frac{1}{\sqrt{P_B}}\right)`} />

<MathBlock tex={String.raw`\text{amount}_1 = L \cdot \left(\sqrt{P_c} - \sqrt{P_A}\right)`} />

---

### Case 3：<InlineMath tex={String.raw`P_c \ge P_B`} />

全部为 token1：

<MathBlock tex={String.raw`\text{amount}_0 = 0`} />

<MathBlock tex={String.raw`\text{amount}_1 = L \cdot \left(\sqrt{P_B} - \sqrt{P_A}\right)`} />

---

正如本节开头所说，在前文中我们已经得到：

<MathBlock tex={String.raw`x_R = \frac{L}{\sqrt{P}} - \frac{L}{\sqrt{P_B}}, \qquad

y_R = L\sqrt{P} - L\sqrt{P_A}`} />

可以看到：

- <InlineMath tex={String.raw`\text{amount}_0`} /> 本质就是 <InlineMath tex={String.raw`x_R`} />
- <InlineMath tex={String.raw`\text{amount}_1`} /> 本质就是 <InlineMath tex={String.raw`y_R`} />

Token 数量公式就是真实储备公式在不同价格区间的展开。

- virtual reserves：定义完整曲线的位置
- real reserves：定义当前持有的 token
- liquidity <InlineMath tex={String.raw`L`} />：定义曲线的“尺度”

三者关系：

<MathBlock tex={String.raw`(x_R + x_V)(y_R + y_V) = L^2`} />

而 token 计算公式，只是这个关系在不同价格区间下的具体表现形式。

## 5. 流动性变化与 Token 的关系（<InlineMath tex={String.raw`ΔL`} />）

- <InlineMath tex={String.raw`L_0 = Liquidity before`} />

- <InlineMath tex={String.raw`L_1 = Liquidity after`} />

- <InlineMath tex={String.raw`\Delta L = L_1 - L_0`} />

---

### Case 1： <InlineMath tex={String.raw`P≤PA`} />

![Diagram 20260402213545](/img/notes/pasted-image-20260402213545.png)

此时 position 完全由 token0 构成，当增加 token0（<InlineMath tex={String.raw`Δx`} />）时，对应的流动性变化为：

<MathBlock tex={String.raw`L_0 = \frac{x}{\frac{1}{\sqrt{P_A}} - \frac{1}{\sqrt{P_B}}}`} />

<MathBlock tex={String.raw`L_1 = \frac{x + \Delta x}{\frac{1}{\sqrt{P_A}} - \frac{1}{\sqrt{P_B}}}`} />

<MathBlock tex={String.raw`\Delta L = L_1 - L_0 = \frac{\Delta x}{\frac{1}{\sqrt{P_A}} - \frac{1}{\sqrt{P_B}}}`} />

在价格低于区间时：

- 只需要 token0 提供流动性
- 流动性的变化完全由 Δx 决定

---

### Case 2：<InlineMath tex={String.raw`P_B ≤ P)`} />

![Diagram 20260402213516](/img/notes/pasted-image-20260402213516.png)

此时 position 完全由 token1 构成。

<MathBlock tex={String.raw`L_0 = \frac{y}{\sqrt{P_B} - \sqrt{P_A}}`} />

<MathBlock tex={String.raw`L_1 = \frac{y + \Delta y}{\sqrt{P_B} - \sqrt{P_A}}`} />

<MathBlock tex={String.raw`\Delta L = L_1 - L_0 = \frac{\Delta y}{\sqrt{P_B} - \sqrt{P_A}}`} />

在价格高于区间时：

- 只需要 token1 提供流动性
- 流动性的变化完全由 Δy 决定

---

### Case 3：<InlineMath tex={String.raw`P_A < P < P_B`} />

![Diagram 20260402214807](/img/notes/pasted-image-20260402214807.png)

此时 **token0 和 token1 都参与**：

<MathBlock tex={String.raw`\begin{aligned}
L_0 &= \frac{x}{\frac{1}{\sqrt{P}} - \frac{1}{\sqrt{P_B}}} \\
&= \frac{y}{\sqrt{P} - \sqrt{P_A}}
\end{aligned}`} />

<MathBlock tex={String.raw`\begin{aligned}
L_1 &= \frac{x + \Delta x}{\frac{1}{\sqrt{P}} - \frac{1}{\sqrt{P_B}}} \\
&= \frac{y + \Delta y}{\sqrt{P} - \sqrt{P_A}}
\end{aligned}`} />

<MathBlock tex={String.raw`\begin{aligned}
\Delta L &= L_1 - L_0 \\
&= \frac{\Delta x}{\frac{1}{\sqrt{P}} - \frac{1}{\sqrt{P_B}}} \\
&= \frac{\Delta y}{\sqrt{P} - \sqrt{P_A}}
\end{aligned}`} />

通过以上三种情况可以看到：

- token0 对应的是 **反价格空间（<InlineMath tex={String.raw`1 / \sqrt{P}`} />）的线性变化**
- token1 对应的是 **价格空间（<InlineMath tex={String.raw`\sqrt{P}`} />）的线性变化**

而 liquidity <InlineMath tex={String.raw`L`} />，本质上是连接这两个空间的“统一度量”。
