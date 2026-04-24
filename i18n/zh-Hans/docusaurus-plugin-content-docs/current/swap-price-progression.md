---
id: swap-price-progression
title: 04 Swap 价格推进
sidebar_label: 04 Swap 价格推进
---

import InlineMath from '@site/src/components/InlineMath';
import MathBlock from '@site/src/components/MathBlock';

## 概述

在前文中，我们已经建立了 Uniswap V3 的完整静态结构：

- 流动性被定义为区间内的虚拟曲线
- 价格通过 tick 进行离散索引
- 使用 sqrtPriceX96 进行精确计算
- 并通过 tickBitmap 实现高效的区间查找

这些内容回答的是一个问题：在任意时刻，系统处于什么状态。然而，一个 CLMM 协议的核心并不是静态状态，而是状态如何变化。

在实际交易过程中：

- 用户输入 token
- Pool 输出另一种 token
- 同时，价格发生变化
- 并可能跨越多个 tick 区间

因此，一个更本质的问题是：当发生一次 swap 时，价格是如何在流动性中移动的？  本章将从“状态变化”的角度，系统分析 Uniswap V3 的 swap 机制，重点回答：

1. 在单个 tick 内，价格如何移动？
2. 当价格触及边界时，如何跨 tick？
3. 跨 tick 时，liquidity 如何变化？
4. 整个 swap 过程如何被拆解为一系列局部步骤？

通过这一章，我们将把前文所有的数学结构与数据结构，统一到一个动态过程之中：swap = 连续价格推进 + 离散流动性变化 + while 状态机。

### 1. 单个 Tick 内的 Swap：`computeSwapStep`

在 V3 中，swap 并不是“用户输入 token，池子按某个公式直接吐出另一种 token”这么简单。

更准确地说，swap 的本质是：

- 在当前有效流动性 <InlineMath tex={String.raw`L`} /> 下
- 价格沿着当前 tick 对应的局部曲线连续移动
- 当价格触及区间边界时，跨越到下一个 tick
- 同时根据 `liquidityNet` 更新全局有效流动性
- 然后在新的流动性区间内继续推进价格

因此，一次完整的 swap，并不是一次公式计算，而是一个由多个局部 step 拼接而成的过程。每个局部 step 都回答同一个问题：

> 在当前流动性、当前价格、目标价格、剩余输入/输出数量已知的情况下，这一步最多能把价格推进到哪里？

这正是 `SwapMath.computeSwapStep` 所做的事情。

如果把一次完整的 swap 看成一段长路径，那么 `computeSwapStep` 处理的并不是整条路径，而只是其中的一个局部片段：

- 当前价格为 `sqrtRatioCurrentX96`
- 当前有效流动性为 `liquidity`
- 当前 step 的目标价格为 `sqrtRatioTargetX96`
- 用户还有多少输入/输出尚未完成，为 `amountRemaining`

函数的目标是：

> 在“不跨出当前 step 目标边界”的前提下，计算这一步实际能走多远，并给出：
>
> - 新价格 `sqrtRatioNextX96`
> - 本步消耗的输入 `amountIn`
> - 本步产出的输出 `amountOut`
> - 本步收取的手续费 `feeAmount`

因此，这个函数本质上是在做一次“受边界约束的局部价格推进”。

#### 1.1 先确定价格移动方向

`computeSwapStep` 的第一件事，不是计算金额，而是先确定这一步价格是向左走还是向右走。

```solidity

bool zeroForOne = sqrtRatioCurrentX96 >= sqrtRatioTargetX96;

```

这意味着：

- 若 `zeroForOne = true`，说明价格目标更低，价格向左移动
- 若 `zeroForOne = false`，说明价格目标更高，价格向右移动

这和前文的价格表示是一致的：`sqrtPriceX96` 是价格的精确链上表示，而 swap 的过程，本质上就是 `sqrtPriceX96` 在价格轴上移动的过程。

因此，`zeroForOne` 并不仅仅表示 “token0 → token1”，它更本质地表示当前 step 中，价格沿哪个方向推进。

![Diagram 20260406163119](/img/notes/pasted-image-20260406163119.png)

![Diagram 20260406204416](/img/notes/pasted-image-20260406204416.png)

#### 1.2 判断 exact input / exact output

在 V3 中，swap 可以有两种模式：

- `exactInput`：用户指定最多投入多少
- `exactOutput`：用户指定希望拿到多少

这两种模式的区别，不在于结果变量不同，而在于价格推进时，系统到底是被“剩余输入预算”约束，还是被“剩余输出目标”约束。因此，后续计算会分成两套路径：

- `exactIn`：先看扣掉手续费后的输入最多能把价格推到哪里
- `exactOut`：先看当前价格区间最多能产出多少输出

##### `exactIn`：先问“剩余输入够不够走到目标价格”

1. 先扣手续费
2. 计算“如果走满到 target，需要多少 input”
3. 比较预算够不够
4. 够：走到 target
5. 不够：在中途停下

在 `exactIn` 模式下，代码先从用户剩余输入中扣除手续费可用部分：

```solidity

uint256 amountRemainingLessFee = FullMath.mulDiv(uint256(amountRemaining), 1e6 - feePips, 1e6);

```

然后计算如果这一步一直走到 `sqrtRatioTargetX96`，理论上需要多少输入？

若价格向左（`zeroForOne`），使用的是：

```

getAmount0Delta(target, current, liquidity, true)

```

若价格向右（`oneForZero`），使用的是：

```

getAmount1Delta(current, target, liquidity, true)

```

这里的含义是在问：在当前 liquidity 下，若价格从当前点推进到目标边界，沿这段局部曲线一共要消耗多少 `input`？

然后把它与 `amountRemainingLessFee` 比较：

- 如果预算足够：本 step 可以直接走到目标边界
- 如果预算不足：价格只能在中途停下，需要反推出新的 `sqrtRatioNextX96`

所以 `exactIn` 的核心逻辑是先比较“预算”与“走完整段所需成本”，再决定是到边界还是中途停止。

##### exactOut：先问“当前区间最多能产出多少输出”

在 `exactOut` 模式下，问题反过来了。  此时先计算如果价格一直推进到目标边界，当前 step 最多能产出多少 output？

若价格向左（`zeroForOne`），用的是：

```solidity

getAmount1Delta(target, current, liquidity, false)

```

若价格向右（`oneForZero`），用的是：

```solidity

getAmount0Delta(current, target, liquidity, false)

```

然后与用户还需要的输出进行比较：

- 如果当前 step 足够覆盖剩余输出目标：价格可以直接推进到目标边界
- 如果不够：说明在达到边界之前就已经满足输出目标，此时需要反推出新的 `sqrtRatioNextX96`

所以 `exactOut` 的核心逻辑是先比较“这一段最多能给多少 output”与“用户还差多少 output”，再决定价格停在哪里。

#### 1.3 重新计算 `amountIn` 和 `amountOut`

在前面的判断中，`computeSwapStep` 先计算的是一个“如果走到目标边界，理论上会消耗/产出多少”的估计值。它的作用主要是判断当前剩余数量，是否足够让价格走到 `target`。

但一旦发现“到不了 `target`，系统就会先求出真正的停止价格 `sqrtRatioNextX96`。此时，原来的 amount 只是“边界假设下的值”，已经不再准确。

因此，后半段代码会基于真正得到的 `sqrtRatioNextX96`，重新计算这一 step 的实际：`amountIn`和`amountOut` 。

也就是说`computeSwapStep`函数的前半段代码是在做边界可达性判断，后半段是在做真实成交量结算，并且这两次计算的角色不同，并不重复。

进一步来看，重新计算 `amountIn` 和 `amountOut` 的逻辑，本质上取决于两个条件：

- 是否走到了目标边界：`max = (sqrtRatioNextX96 ** sqrtRatioTargetX96)`
- 用户模式：`exactIn` or `exactOut`

这两个条件组合在一起，一共形成 4 种情况：

### Case 1：`max && exactIn`（到达边界 + 输入模式）

```solidity

amountIn = amountIn

```

此时意味着：

- 用户提供的输入足够走到 target
- 前面已经计算过：“走到 target 需要多少 input”

因此：

- `amountIn` 就是这个值，无需重新计算
- `amountOut` 需要重新根据真实路径计算（避免精度误差）

本质是已经走完整段区间，input 是“理论值”，可以直接用。

---

### Case 2：`max && !exactIn`（到达边界 + 输出模式）

```solidity

amountOut = amountOut

```

此时意味着：

- 当前 step 最多只能产出这么多 output
- 并且用户需求 ≥ 这个最大值

因此：

- `amountOut` 就是“该区间最大可提供 output”
- `amountIn` 需要重新计算（因为 input 是推导出来的）

本质是已经榨干这一段流动性，output 是“极限值”，可以直接用。

---

### Case 3：`!max && exactIn`（未到边界 + 输入模式）

```solidity

amountIn = getAmountDelta(...)
amountOut = getAmountDelta(...)

```

此时意味着：

- 用户输入不够走到 `target`
- 价格停在中间某个位置 `sqrtRatioNextX96`

因此：

- 前面“走到 target 的 amountIn”已经无效
- 必须基于真实停止点重新计算：`current → sqrtRatioNextX96`

相当于“中途停止”的情况，所有 amount 都必须重算。

---

### Case 4：`!max && !exactIn`（未到边界 + 输出模式）

同理：

- 用户想要的 `output` 在当前区间内就已经满足
- 价格提前停止

因此：

- `amountOut` 需要被 cap（不能超过用户需求）
- `amountIn` 也必须基于真实价格重新计算

相当于 `output` 在中途就满足，价格不会走到边界。

---

### exactOut 下的最终收口

到这里为止，我们已经基于真实停止价格 `sqrtRatioNextX96`，重新计算出了本 step 的`amountIn`和`amountOut`。

但需要注意在 `exactOut` 模式下，这个 `amountOut` 仍然可能“略微超过用户真正还需要的 output”。

因此源码中还会再做一次收口：

```solidity

if (!exactIn && amountOut > uint256(-amountRemaining)) {
	amountOut = uint256(-amountRemaining);
}

```

因为：

- `exactIn`：约束的是 input
    → output 是计算结果，不存在“超出需求”

- `exactOut`：约束的是 output
    → 必须严格满足“不能超过用户需求”

其中 `-amountRemaining` 表示当前 step 用户还剩多少 output 需要被满足。

这段 cap 的本质可以理解为在 exactOut 模式下，对最终输出做一次“硬性上限保护”。

#### 1.4  `feeAmount` 手续费计算

在理解完 `amountIn` 和 `amountOut` 的重新计算之后，接下来还需要回答一个问题：为什么 `feeAmount` 不是在前面和 `amountIn` 一起确定，而是要放到最后单独计算？

表面上看，好像前面已经在 `exactIn` 分支里处理过一次 `fee`：

```solidity

uint256 amountRemainingLessFee = FullMath.mulDiv(uint256(amountRemaining), 1e6 - feePips, 1e6);

```

看起来像是“前面已经处理过一次 fee，最后又算一次”，但实际上并不是重复计算，而是两个不同阶段：

- 前面 `amountRemainingLessFee` 的作用，是在 `exactIn` 模式下先估算“最多有多少净输入可以用于推动价格”
- 这里的 `feeAmount`，才是根据真实成交结果，**正式结算本 step 的手续费**

也就是说：

- 前面是在做 路径判断
- 这里是在做 最终结算

所以代码先做：

<MathBlock tex={String.raw`\text{amountRemainingLessFee} =\text{amountRemaining} \cdot \frac{1e6 - \text{feePips}}{1e6}`} />

`fee` 计算的整体顺序是：

```

先确定真实停止价格
→ 再确定真实 amountIn / amountOut
→ 最后再确定真实 feeAmount

```

在 `computeSwapStep` 函数中，代码将 `fee` 计算分为4种情况：

```solidity

if (exactIn && sqrtRatioNextX96 != sqrtRatioTargetX96) {
    feeAmount = uint256(amountRemaining) - amountIn;
} else {
    feeAmount = FullMath.mulDivRoundingUp(amountIn, feePips, 1e6 - feePips);
}

```

### Case 1：`exactIn && !max`

它表示当前是 exact input 模式，并且这一步没有走到 `target`。也就是说用户当前剩余的输入预算，不足以把价格推进到目标边界。

这时，前面已经算过 `amountRemainingLessFee`，它表示扣掉手续费之后，最多能真正进入曲线的净输入。而现在又重新算出了真实的 `amountIn`，由于当前 step 没走到 target，说明这一步不是被边界截断的，而是被输入预算本身截断的，并且这一步已经把用户剩余输入 `amountRemaining` 全部消耗完了。

因此在这个场景下，当前 step 的总输入满足：

<MathBlock tex={String.raw`\text{amountRemaining}=\text{amountIn}+\text{feeAmount}`} />

所以直接得到：

<MathBlock tex={String.raw`\text{feeAmount}=\text{amountRemaining}-\text{amountIn}`} />

---

### Case 2：exactIn && max

表示当前是 exact input，并且这一步成功走到了 target。即用户当前剩余输入很多，足够支撑价格从 current 一直推进到 target。

此时，这一步真正消耗的只是“走到 target 所需的那部分输入”，而不是把 `amountRemaining` 全部花完。

因此这里只能根据 **本 step 实际净输入 `amountIn`**，按费率反推出这一步对应的手续费：

<MathBlock tex={String.raw`\text{feeAmount} = \text{amountIn} \cdot \frac{\text{feePips}}{10^6 - \text{feePips}}`} />

---

### Case 3：!exactIn && max

表示当前是 exact output，并且这一步走到了 target。即在当前 step 内，即使把价格推进到目标边界，输出仍然没有满足用户总需求，所以必须继续往后走。

所以在 exactOut 下，手续费的结算方式一定只能是：

1. 先求出为了得到这些 output，真实需要多少净输入 `amountIn`
2. 再根据费率，从净输入反推出 gross input 中的 fee 部分

也就是：

<MathBlock tex={String.raw`\text{feeAmount} = \text{amountIn} \cdot \frac{\text{feePips}}{10^6 - \text{feePips}}`} />

---

### Case4：!exactIn && !max

这表示当前是 exact output，并且这一步没有走到 target。即用户所要求的 output，在当前区间中途就已经满足了，因此价格提前停止。

因此这里也必须使用：

<MathBlock tex={String.raw`\text{feeAmount} = \text{amountIn} \cdot \frac{\text{feePips}}{10^6 - \text{feePips}}`} />

| 情况                 | 含义                     | fee 计算方式                    | 原因                                       |
| ------------------ | ---------------------- | --------------------------- | ---------------------------------------- |
| `exactIn && !max`  | 输入预算先耗尽，价格中途停止         | amountRemaining - amountIn` | 当前 step 刚好耗尽全部输入预算                       |
| `exactIn && max`   | 输入足够，价格走到 target       | 比例公式                        | 只使用了部分输入预算，不能直接相减                        |
| `!exactIn && max`  | exactOut，且走到 target    | 比例公式                        | `amountRemaining` 表示 output，不是 input     |
| `!exactIn && !max` | exactOut，且中途已满足 output | 比例公式                        | `amountRemaining` 仍表示 output，不能参与 fee 计算 |

### 2. 完整 Swap：`UniswapV3Pool.swap`

在上一节中，我们已经分析了 `computeSwapStep`，理解了在单个 tick 内，价格如何在固定 liquidity 下推进，并完成本 step 的 `amountIn`、`amountOut` 与 `feeAmount` 结算。

但一次完整的 swap，通常不会只发生在单个 tick 内。当价格推进到当前区间边界之后，协议还需要继续处理几个问题：

- 下一个边界 tick 在哪里？
- 是否需要跨 tick？
- crossing 之后 liquidity 如何变化？
- 剩余输入 / 输出是否还需要继续撮合？

因此，`computeSwapStep` 负责的是“单步推进”，而 `swap` 负责的是“把多个 step 组织成一次完整交易”。

![Diagram 20260406210528](/img/notes/pasted-image-20260406210528.png)

#### 2.1 `swap` 不是一次计算，而是一个状态机

如果说 `computeSwapStep` 解决的是“当前 step 最多能走到哪里”，那么 `swap` 解决的就是如何在价格轴上不断重复这个 step，直到整笔交易完成。因此，`swap` 本质上不是一次公式求值，而是一个循环驱动的状态机。

在这个状态机中，协议会反复执行以下过程：

1. 找到当前方向上的下一个 initialized tick
2. 确定本轮 step 的目标价格
3. 调用 `computeSwapStep` 完成局部推进
4. 如果价格触及边界，则执行 tick crossing，更新有效流动性
5. 检查是否还有剩余输入 / 输出需要继续处理

所以，一次完整的 swap，可以理解为多个局部价格推进 step 在 tick 轴上的连续拼接。

#### 2.2 进入循环前：初始化本次 swap 的起点状态

在真正进入 while 循环之前，`swap` 先完成三类准备工作：

1. 校验本次交易是否合法
2. 锁定 pool，防止重入
3. 构造本次 swap 的初始状态

例如：

- `amountSpecified != 0`：交易数量不能为 0

- `slot0.unlocked = false`：在 swap 执行期间上锁

- `sqrtPriceLimitX96` 必须位于合法方向上
	更具体地说，这个约束与 swap 方向强绑定：

	- 若 `zeroForOne = true`（价格向左移动）
	→ `sqrtPriceLimitX96` 必须 **小于当前价格**，且大于 `MIN_SQRT_RATIO`

	- 若 `zeroForOne = false`（价格向右移动）
	→ `sqrtPriceLimitX96` 必须 **大于当前价格**，且小于 `MAX_SQRT_RATIO`

	用户设置的 price limit 必须与价格推进方向一致，否则交易会直接 revert。

这些检查的作用，不是 swap 逻辑本身，而是确保后续价格推进过程有一个合法、稳定的起点。

协议会把本次 swap 的运行状态抽象到 `SwapState` 中，包括：

- `amountSpecifiedRemaining`：还剩多少输入 / 输出尚未处理
- `amountCalculated`：到当前为止已经累计计算出的另一侧 token 数量
- `sqrtPriceX96`：当前价格
- `tick`：当前 tick
- `liquidity`：当前有效流动性
- `feeGrowthGlobalX128`：当前方向上的全局手续费累计值

这意味着，从进入 while 循环开始，协议不再直接“面向整个 pool 做推导”，而是每一轮都只更新这组运行时状态。

#### 2.3 while 循环的四个核心步骤

`swap` 的主体是一个 while 循环：

```solidity

while (state.amountSpecifiedRemaining != 0 && state.sqrtPriceX96 != sqrtPriceLimitX96)

```

它表示：

- 只要用户指定的输入 / 输出还没有处理完
- 并且价格还没有达到用户设置的限制价格

协议就继续推进 swap。每一轮循环，本质上都在完成一个局部 step。这个 step 可以拆成四个动作。

##### 第一步：找到下一个 initialized tick

找到下一个候选边界 tick。每一轮循环的第一件事，是调用：

```solidity

tickBitmap.nextInitializedTickWithinOneWord(...)

```

它的作用是找到当前方向上，下一个可能导致流动性发生变化的 initialized tick。

这是因为在 V3 中：

- 价格可以连续移动
- 但 liquidity 只会在 crossing initialized tick 时发生跳变
- 所以协议不需要扫描每一个 tick，而只需要快速找到“下一个有意义的边界”

这正是前文 `tickBitmap` 的作用，它让 swap 可以在稀疏初始化的 tick 集合中，高效找到下一个边界，而不必逐 tick 遍历。

##### 第二步：确定本 step 的目标价格

找到 `tickNext` 之后，协议会先求出它对应的边界价格：

```solidity

step.sqrtPriceNextX96 = TickMath.getSqrtRatioAtTick(step.tickNext);

```

但本轮 step 的真正目标价格，并不总是这个边界价格。因为用户在 swap 时还额外给出了 `sqrtPriceLimitX96`，表示本次交易允许价格推进到的极限位置。

因此，本轮 step 的目标价格，实际上是两者中“更先到达的那个”：

- 若价格向左移动，就取更靠左但不能越过 limit 的那个价格
- 若价格向右移动，就取更靠右但不能越过 limit 的那个价格

所以这里的关键不是“去下一个 tick”，而是在“下一个 initialized tick”与“用户价格限制”之间，选择当前 step 真正允许到达的终点。

##### 第三步：调用 `computeSwapStep` 推进价格并结算本步

目标价格确定之后，协议调用：

```solidity

SwapMath.computeSwapStep(...)

```

它基于：

- 当前价格 `state.sqrtPriceX96`
- 当前有效流动性 `state.liquidity`
- 本轮目标价格
- 当前剩余输入 / 输出 `state.amountSpecifiedRemaining`

计算出这一轮 step 的真实结果：

- 新价格 `state.sqrtPriceX96`
- 本步 `amountIn`
- 本步 `amountOut`
- 本步 `feeAmount`

也就是说，`swap` 自身并不负责单个 tick 内的数学细节；它只是把当前状态打包后交给`computeSwapStep`，再接收这个 step 的结算结果。

然后顺势接状态更新，拿到本轮 step 的结算结果后，`swap` 会继续更新两个核心变量：

- `amountSpecifiedRemaining`
- `amountCalculated`

---

###### 更新 exactInput / exactOutput 状态

###### 1. exactInput 模式：

- `amountSpecifiedRemaining` 表示“还剩多少 input 可以使用”
- 每一轮会减少：  `amountIn + feeAmount`
- `amountCalculated` 累计输出（注意源码中是负数累加）

本质是用掉输入 `amountIn` 预算，换取输出 `amountOut`。

###### 2. exactOutput 模式：

- `amountSpecifiedRemaining` 初始为负，表示“还差多少 output”
- 每一轮会增加：`amountOut`（逐渐接近 0）
- `amountCalculated` 累计实际需要支付的 `input + fee`

因此，while 循环中的 `amountSpecifiedRemaining`，并不是一个静态参数，而是在每一轮 step 结束后不断收缩，直到最终变为 0，或价格先达到用户限制。

本质是不断用 input 去填补 output 缺口。

因此：

- 在 `exactInput` 模式下，扣减剩余输入预算，累计输出
- 在 `exactOutput` 模式下，扣减剩余输出目标，累计输入成本

---

###### Protocol Fee 与 LP Fee 的分配顺序

在每一轮 step 中，`feeAmount` 并不会全部分配给 LP。

```solidity

if (cache.feeProtocol > 0) {
uint256 delta = step.feeAmount / cache.feeProtocol;
step.feeAmount -= delta;
state.protocolFee += delta;
}

```

这表示先从当前 step 的 `feeAmount` 中切出一部分给 protocol。

这里需要注意，切出 protocol fee 之后，`step.feeAmount` 会被减少。  因此后续进入 LP fee growth 计算的，并不是原始的 `feeAmount`，而是扣除 `protocol fee` 之后的剩余 `fee`。

紧接着，在同一轮 while 内，还会执行：

```solidity

if (state.liquidity > 0)
    state.feeGrowthGlobalX128 += FullMath.mulDiv(
        step.feeAmount,
        FixedPoint128.Q128,
        state.liquidity
    );

```

也就是说 LP 实际分到的是扣除 protocol fee 之后的剩余部分。因此，在 while 内每一轮 step 的 fee 分配顺序是：

```

step.feeAmount
→ 先切出 protocol fee
→ 剩余部分累计到 state.feeGrowthGlobalX128

```

但这里的 `state.protocolFee` 和 `state.feeGrowthGlobalX128` 仍然只是本次 swap 的运行时状态，并没有立刻写回全局 storage。

真正的全局提交发生在 while 循环结束之后：

```solidity

if (zeroForOne) {
    feeGrowthGlobal0X128 = state.feeGrowthGlobalX128;
    if (state.protocolFee > 0) protocolFees.token0 += state.protocolFee;
} else {
    feeGrowthGlobal1X128 = state.feeGrowthGlobalX128;
    if (state.protocolFee > 0) protocolFees.token1 += state.protocolFee;
}

```

因此，完整顺序可以总结为：

```

while 内：
step.feeAmount
→ 抽 protocol fee
→ 剩余部分累计到 state.feeGrowthGlobalX128
→ protocol 部分累计到 state.protocolFee

while 外：
state.feeGrowthGlobalX128
→ 写回 feeGrowthGlobal0X128 / feeGrowthGlobal1X128

state.protocolFee
→ 写回 protocolFees.token0 / protocolFees.token1

```

##### 第四步：若触及边界，则 crossing tick 并更新 liquidity

如果本轮 step 结束后满足条件 `state.sqrtPriceX96 ** step.sqrtPriceNextX96`，说明价格已经推进到了本轮候选边界价格。这时，若该 tick 是 initialized 的，协议就需要执行：

```solidity

ticks.cross(...)

```

它会读取这个 tick 上记录的 `liquidityNet`，并将其应用到当前全局有效流动性`state.liquidity`中。这一步非常关键，因为它意味着：

- 在 tick 内，价格推进是连续的
- 但在 crossing tick 的瞬间，流动性会发生离散跳变

这正是 V3 的一个核心机制，价格在固定 liquidity 下分段连续移动，而 liquidity 只在 crossing initialized tick 时分段变化。

但是需要注意的是，crossing 之后 `liquidityNet` 的符号还要根据移动方向解释：

- 向右移动时，按正常符号应用
- 向左移动时，需要取反

因为同一个 tick，从左往右穿过与从右往左穿过，意味着“进入区间”和“离开区间”的语义正好相反。

##### 未 crossing 时，tick 如何更新

除了 crossing tick 之外，还有一种情况：

- 本轮价格发生了变化
- 但没有走到候选边界 tick

源码对应：

```solidity

else if (state.sqrtPriceX96 != step.sqrtPriceStartX96) {
state.tick = TickMath.getTickAtSqrtRatio(state.sqrtPriceX96);
}

```

表示价格在当前 tick 内中途停止（没有 crossing）。此时不会触发 liquidity 变化，但仍然需要根据新的价格重新计算当前 tick。

因此，tick 更新有两种路径：

1. **crossing tick** → 使用 `liquidityNet` 更新 liquidity，并跳到新 tick
2. **未 crossing** → 根据价格反推出当前 tick

两者共同保证 tick 始终与当前价格保持一致。

#### 2.4 什么时候结束 swap

`while` 循环会在以下两种情况下停止：

1. `state.amountSpecifiedRemaining ** 0`  表示用户指定的输入 / 输出目标已经完成。
2. `state.sqrtPriceX96 ** sqrtPriceLimitX96`  表示价格已经走到用户允许的极限位置，不能再继续推进。

因此，swap 的结束条件并不只有“数量撮合完毕”，还可能是“价格保护生效，提前停止”。

#### 2.5 循环结束后，如何回写 pool 状态

`while` 循环结束后，协议会把本次 swap 的运行时状态回写到 pool 的全局状态中，包括：

- 更新 `slot0.sqrtPriceX96`
- 更新 `slot0.tick`
- 若 tick 发生变化，则写入 observation
- 若 liquidity 发生变化，则更新 pool 的 `liquidity`
- 更新全局手续费增长 `feeGrowthGlobalX128`
- 更新 protocol fee

所以 `while` 循环里维护的是“本次交易的临时状态”，  循环结束后，才把最终结果正式提交回 pool。

最后，`swap` 还会执行 token 转账与 callback 校验，确保调用方真正支付了所需输入资产。
这说明 V3 的 swap 过程是：

- 先根据状态机计算出应付 / 应收结果
- 再通过 callback 向调用方收款
- 最终完成结算

现在可以把整个 `swap` 过程统一起来理解：

- `computeSwapStep` 负责单个 tick 内的局部价格推进
- `tickBitmap` 负责快速找到下一个 initialized tick
- `ticks.cross` 负责在 crossing 时更新有效流动性
- `while` 循环负责把多个 step 串成一次完整交易

因此，一次完整的 swap，并不是一次整体公式求解，而是在价格轴上，不断寻找边界、推进价格、更新流动性、继续推进的分段状态演化过程。

这也是为什么前文的 liquidity、tick、sqrtPriceX96、tickBitmap 必须一起理解它们并不是彼此独立的模块，而是在 `swap` 中共同构成了价格运动的完整机制。
