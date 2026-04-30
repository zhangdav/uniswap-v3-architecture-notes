---
id: tick-and-tick-bitmap
title: 03 Tick 与 TickBitmap
sidebar_label: Tick 与 TickBitmap
---

import InlineMath from '@site/src/components/InlineMath';
import MathBlock from '@site/src/components/MathBlock';

## 概述

在 Uniswap V3 中`tick`数量非常大（≈ 1.7M），但实际被使用的 `tick` 很少（稀疏）。因此不能直接存储所有 tick，而是需要一种高效的数据结构来快速判断 tick 是否已初始化，以及快速找到下一个初始化的 tick，为此，引入了 tickBitmap。

### 1. TickBitmap 的数据结构

`tickBitmap` 本质是：

<MathBlock tex={String.raw`\text{mapping(int16 => uint256)}`} />

![Diagram 20260403134743](/img/notes/pasted-image-20260403134743.png)

含义：

- key（int16）：表示一个 256 tick 的区块编号（word）
- value（uint256）：表示该区块中 256 个 tick 的状态是否初始化

每一位：

- 1：该 tick 已初始化
- 0：未初始化

例如：

```

当 `tickSpacing = 1` 时：

word = 0   → ticks [0 ~ 255]
word = 1   → ticks [256 ~ 511]
word = -1  → ticks [-256 ~ -1]

```

一个 tick 会被拆成两部分：

- `word position`：表示落在哪个 `uint256` word 中
- `bit position`：表示这个 word 的第几位

也就是：

- wordPos : int16 用来定位第几个 256-bit 区块

```

tickBitmap[wordPos]

```

- bitPos  : uint8 用来定位这个区块中的第几位

```

tickBitmap[wordPos] & (1 << bitPos)

```

对应关系：

```

mapping(int16 => uint256) public tickBitmap;

```

因为一个 `uint256 = 256 bits`，所以可以用一个 `uint256` 存 256 个 tick 的初始化状态。这样可以通过位运算快速找到当前 tick 是否初始化，左边最近的初始化 tick，或右边最近的初始化 tick。

### 2. Tick 如何映射到 Bitmap（核心）

#### 2.1 TickSpacing 与有效 Tick

池子并不会使用所有 tick，而是只允许 `tickSpacing` 的整数倍作为有效 tick，例如：

- 当 `tickSpacing = 1` 时，所有 tick 都可能有效
- 当 `tickSpacing = 10` 时，只有 `..., -20, -10, 0, 10, 20, ...` 这些 tick 才可能被初始化
- 当 `tickSpacing = 60` 时，只有 `..., -120, -60, 0, 60, 120, ...` 这些 tick 才可能被初始化

因此，bitmap 实际记录的不是“原始 tick 是否初始化”，而是被压缩后的值，通常为：

```solidity

compressed = tick / tickSpacing

```

#### 2.3 拆分 wordPos 和 bitPos

然后再拆成两个部分 wordPos 和 bitPos：

- `wordPos` 取高 16 位
- `bitPos` 取低 8 位

也就是把一个压缩后的 `int24` 拆成：

```solidity

[ 高 16 位 | 低 8 位 ]

int16 wordPos = int16(compressed >> 8);
uint8 bitPos = uint8(uint24(compressed % 256));

```

又因 Solidity 的除法对负数是朝 0 截断，而 bitmap 需要的是向下取整的分组方式。例如：

```solidity

tick = -1
tickSpacing = 10

-1 / 10 = 0

// Solidity 朝 0 截断

```

但从 bitmap 分组的角度看，`-1` 应该属于 `[-10, -1]` 这一组，而不是 `[0, 9]` 这一组，所以在V3 中，会对负数且不能整除的情况额外修正：

```

if (tick < 0 && tick % tickSpacing != 0) compressed--;

```

这样才能保证负数 tick 被分到正确的 word / bit 区间。

#### 2.4 示例：tick = -200697

```solidity

int24 tick = -200697

tickSpacing = 1

compressed = -200697

```

因为一个 word = 256 bits，所以可以把 compressed tick 看成：

- 高 16 位：决定它属于哪个 word
- 低 8 位：决定它在该 word 中的哪一位

也就是说，源码中的 `wordPos` 和 `bitPos` 本质上是在取 compressed tick 的高位和低位。

从直觉上，可以把它近似理解为：

`compressed ≈ wordPos * 256 + bitPos`

但这不是严格的数学分解，尤其在负数情况下更应理解为是对 compressed tick 的高位和低位进行拆分。

```solidity

wordPos = compressed >> 8  = -784
bitPos = uint8(uint24(compressed)) = 7

	   |<---- word position (int16) ---->|<- bit position (uint8) ->|
tick = | 1 1 1 1 1 0 0 1 1 1 1 0 0 0 0 0 |  0  0  0  0  0  1  1  1  |
	   | = -784                          | = 7                      |

# 定位 bitmap

# wordPos = -784 → 对应 tickBitmap[-784]

# 该 word 是一个 uint256，共 256 bits

在 tickBitmap[-784] 的第 7 位设置为 1

```

### 4. 如何将 Tick 写入 Bitmap

前面我们提到了，关于如何计算 compressed，包括保证在负数情况下也能被分到正确的 word / bit 区间，以及如何定位 word 和 bit。那么，接下来是构造 mask，然后写入 bitmap，即：

```solidity

uint256 mask = 1 << bitPos;
tickBitmap[wordPos] |= mask;

tickBitmap[-784] |= (1 << 7) 表示该 tick = -200697 已被初始化并存入 bitmap

```

![Diagram 20260403155323](/img/notes/pasted-image-20260403155323.png)

这里需要注意，并不是任意 tick 都能写入 TickBitmap，只有满足前面条件 `tick % tickSpacing ** 0` 的 tick，才是合法的可初始化 tick。

同样，如果要从 bitmap 中判断 `tick = -200697` 是否初始化，需要在 `tickBitmap[-784]` 这个 uint256 中，通过位运算找到第 7 位，并检查其第 7 位是否为 1。

## 6. Tick flipTick

在 V3 中，当某个 tick 的初始化状态发生变化时，需要通过 `flipTick` 来切换某个 tick 的初始化状态。

只有在以下两种情况下会触发 flip：

1. 当某个 tick 第一次被初始化（liquidity 从 0 → 非 0）
2. 当某个 tick 被完全清空（liquidity 从 非 0 → 0）

也就是说，只有在 0 ↔ 非0 的状态变化时才会 flip。它是通过 XOR 的方式实现的，因为 XOR 可以在 0 和 1 之间切换，避免额外判断当前状态，而且 gas 更低。

![Diagram 20260403155802](/img/notes/pasted-image-20260403155802.png)

## 7. 如何查找下一个已初始化的 Tick

在 Uniswap V3 中，`TickBitmap` 不仅用于记录 tick 是否初始化，更重要的是用于快速查找下一个已初始化的 tick。

### 7.1 Case 1: Find <InlineMath tex={String.raw`next tick <= current tick`} />

在当前 tick 所在的 word 中，找到右侧最近的已初始化 tick

![Diagram 20260403164441](/img/notes/pasted-image-20260403164441.png)

第一步：定位当前 tick

```solidity

int24 compressed = tick / tickSpacing;

if (tick < 0 && tick % tickSpacing != 0) {
    compressed--;
}

int16 wordPos = int16(compressed >> 8);
uint8 bitPos  = uint8(uint24(compressed));

```

第二步：读取 bitmap

```solidity

uint256 word = tickBitmap[wordPos];

```

第三步：构造 mask（保留右侧 bits）

我们只关心当前 bitPos 以及其右侧的所有 bit

```solidity

uint256 mask = ~((1 << bitPos) - 1);

```

第四步：过滤 bitmap

```solidity

uint256 masked = word & mask;

```

只保留小于等于 bitPos 的所有已初始化 tick

第五步：找到最近的 1

- 如果 `masked != 0` 说明当前 word 中右侧存在已初始化 tick。此时需要找到，右边最近的 1。

- 如果当前 word 没有 `masked ** 0`，说明当前 word 中右侧没有已初始化 tick。则需要跳到下一个 word 中继续找。

```solidity

wordPos += 1`。
word = tickBitmap[wordPos];
nextBitPos = BitMath.leastSignificantBit(word);

```

第六步：还原 tick

```solidity

int24 nextTick = (compressed - int24(bitPos) + int24(nextBitPos)) * tickSpacing;

```

### 7.2 Case 2: Find <InlineMath tex={String.raw`next tick > current tick`} />

在这一部分，我们需要找到大于当前 tick 的，下一个左侧最近已初始化 tick。

![Diagram 20260403165658](/img/notes/pasted-image-20260403165658.png)

第一步：定位当前 tick

```solidity

int24 compressed = tick / tickSpacing;

if (tick < 0 && tick % tickSpacing != 0) {
    compressed--;
}

int16 wordPos = int16(compressed >> 8);
uint8 bitPos  = uint8(uint24(compressed));

```

第二步：读取 bitmap

```solidity

uint256 word = tickBitmap[wordPos];

```

第三步：构造 mask（保留左侧 bits）

我们只关心当前 bitPos 以及其右侧的所有 bit

```solidity

uint256 mask = ~((1 << (bitPos + 1)) - 1);

```

第四步：过滤 bitmap

```solidity

uint256 masked = word & mask;

```

只保留 大于 bitPos 的所有已初始化 bit。

第五步：找到最近的 1

- 如果 `masked != 0` 说明当前 word 中左侧存在已初始化 tick。此时需要找到，左边最近的 1。

- 如果当前 word 没有 `masked == 0`，说明当前 word 中左侧没有已初始化 tick。则需要跳到下一个 word 中继续找。

```solidity

wordPos -= 1;
word = tickBitmap[wordPos];
nextBitPos = BitMath.leastSignificantBit(word);

```

第六步：还原 tick

```solidity

int24 nextTick = (compressed - int24(bitPos) + int24(nextBitPos)) * tickSpacing;

```
