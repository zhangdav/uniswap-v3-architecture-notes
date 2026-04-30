---
id: fee-and-settlement
title: 06 Fees and Fund Settlement
sidebar_label: Fees and Fund Settlement
---

import InlineMath from '@site/src/components/InlineMath';
import MathBlock from '@site/src/components/MathBlock';

## Overview

In the previous chapter, we learned that LPs participate in swaps by providing liquidity. In this chapter, we explain a core question in V3: how are LP returns calculated? In Uniswap, LP income mainly comes from swap fees, but the mechanism is very different between V2 and V3.

In V2, all liquidity is globally shared, there is no price range, and all LP funds participate in every transaction. Therefore, in each swap, the trader pays a fee (such as 0.3%), and those fees are added directly to the pool's reserves. LPs do not receive fees directly, but instead own part of the pool's assets through their LP token share.

Its essence is:

```

LP income ∝ LP holding shares × accumulated fees of the pool

```

Therefore, in V2, there is no need to calculate fees transaction by transaction, distinguish between intervals, or track historical state.

However, the problem becomes more complicated in V3. Liquidity is distributed across different price ranges, and only active liquidity participates in swaps. Because liquidity differs across ranges, different LPs participate in transactions to varying degrees at different times and in different intervals.

## 1. Single swap

Let’s not look at the contract first. Let’s start with the theoretical calculation.

![Diagram 20260422111021](/img/notes/pasted-image-20260422111021.png)

- Yellow column: total liquidity (L) in different tick intervals
- Pink horizontal bar: liquidity (S) provided by Alice
- Dashed line position: price is moving (swap process)
- f₀, f₁: fees generated in different ranges

Assumption: the user exchanges token Y for token X, so the price moves to the right.

```

Step 1: Transaction within the first interval (L₀)

The price first moves within the range L₀
→ Generate fee f₀
→ All LPs in this range participate in the distribution

Step 2: Price enters the next range (L₁)

Price continues to move to the next range L₁
→ There is also a fee f₁
→ LP in this range re-participates in distribution

```

How much fee can Alice get?

In the interval <InlineMath tex={String.raw`L_0`} />:

```

Alice share = S / L0

Fee received = f0 × (S / L0)

```

In the interval <InlineMath tex={String.raw`L_1`} />:

```

Alice share = S / L1

Fee received = f1 × (S / L1)

```

Total revenue:

<MathBlock tex={String.raw`f = f_0 \cdot \frac{S}{L_0} + f_1 \cdot \frac{S}{L_1}`} />

Therefore, each price range is an independent fee allocation pool. In each interval, LPs share the fees generated in that interval in proportion to their liquidity relative to the total liquidity in that interval.

## 2. Multiple intervals (introduction time)

However, V3 is not a simple single-swap system. Swaps can span multiple intervals, occur at different times, and generate fee allocations in different intervals.

![Diagram 20260422111049](/img/notes/pasted-image-20260422111049.png)

- Yellow column: total liquidity at a given time within a given tick interval
- Pink horizontal bar `S`: liquidity provided by Alice
- Purple mark `L_{i,t}`: total liquidity in the `t`th moment and `i`th interval
- Orange mark `f_{i,t}`: fees generated at time `t` in interval `i`

Here we record the "interval" as `i` and the "time" as `t`.

---

### Case 1: `t = 0`

At the first moment, the price moves to the right and crosses two ranges.

The corresponding figure is:

- In the interval `i = 0`, the fee `f_{0,0}` was generated
- In the interval `i = 1`, the fee `f_{1,0}` was generated

Alice provides liquidity `S` in both ranges, so she can share the fees in these two ranges respectively.
In the interval `i = 0`, Alice's proportion is: <InlineMath tex={String.raw`S / L_{0,0}`} />, so the fee she gets in this interval is: <InlineMath tex={String.raw`f_{0,0} \cdot \frac{S}{L_{0,0}}`} />

Similarly, in the interval `i = 1`, she gets: <InlineMath tex={String.raw`f_{1,0} \cdot \frac{S}{L_{1,0}}`} />

Therefore, the total revenue corresponding to the first graph is:

<MathBlock tex={String.raw`f^{(0)} = f_{0,0} \cdot \frac{S}{L_{0,0}} + f_{1,0} \cdot \frac{S}{L_{1,0}}`} />

---

### Case 2: `t = 1`

At the second moment, the price moves to the left.

At this moment, the price moves to the left, corresponding to the swap direction X → Y. Since we are currently only concerned with fees in token Y:

- There will be no Y fee in this direction
- Therefore, there is no contribution to `feeGrowth(Y)`

Therefore:

<MathBlock tex={String.raw`f^{(1)} = 0`} />

Therefore, Alice does not earn distributable fees at every moment or in every interval.

---

### Case 3: `t = 2`

At the third moment, the price moves to the right again and crosses more ranges.

The corresponding figure is:

- In the interval `i = -2`, the fee `f_{-2,3}` was generated
- In the interval `i = -1`, the fee `f_{-1,3}` was generated
- In the interval `i = 0`, the fee `f_{0,3}` was generated

The current total liquidity in these intervals is:

- `L_{-2,3}`
- `L_{-1,3}`
- `L_{0,3}`

Therefore, the total fee Alice receives at this moment is:

<MathBlock tex={String.raw`f^{(3)} =

f_{-2,3} \cdot \frac{S}{L_{-2,3}}
+ f_{-1,3} \cdot \frac{S}{L_{-1,3}}
+ f_{0,3} \cdot \frac{S}{L_{0,3}}`} />

The key point is this: LP fees are not uniformly distributed across the entire pool. They are calculated separately in each interval based on liquidity proportion. If we ignore time for the moment and look only at the case where a single price movement spans multiple intervals, then Alice's total income can be written as:

<MathBlock tex={String.raw`f = \sum_i f_i \cdot \frac{S}{L_i}`} />

- `f_i`: fee generated in step `i`
- `L_i`: total liquidity in interval `i`
- `S`: Alice’s liquidity

What this formula means:

> For each range that the price passes through, Alice will share the fees generated in that range according to her proportion of liquidity in that range.

If we factor out `S`, it can also be written as:

<MathBlock tex={String.raw`f = S \cdot \sum_i \frac{f_i}{L_i}`} />

This is already close to the idea behind `feeGrowth`.

We added the time dimension earlier, because in reality, swap does not happen only once. Prices will continue to change at different times, and liquidity in different intervals may also change. Therefore, fee distribution is not only "across intervals", but also "across time."

So at the `t`th moment, Alice’s income can be written as:

<MathBlock tex={String.raw`f_t = S \cdot \sum_i \frac{f_{i,t}}{L_{i,t}}`} />

This represents the sum of Alice’s fee income in all relevant intervals at time `t`.

If we add up all the time periods, Alice's total income from the starting moment to the final moment is:

<MathBlock tex={String.raw`f = \sum_t f_t`} />

Combining the above two formulas, we can get the final general form:

<MathBlock tex={String.raw`f = S \cdot \sum_t \sum_i \frac{f_{i,t}}{L_{i,t}}`} />

Therefore, LP income in V3 is a double weighted summation across time and across intervals. At each point in time and in each price range, the fee is allocated according to the LP's liquidity proportion. So the question is: Why can’t it be calculated directly on-chain according to this formula?

Because doing so means that we must traverse: all time points, all intervals in which swap has occurred, and liquidity changes corresponding to all intervals. This is obviously not feasible on-chain because the gas cost would explode.

Therefore, this formula is "theoretically the most intuitive definition of fees", but it is not a direct implementation method in the contract. It is precisely because of this that V3 must design a set of compressed accounting methods to compress this complex sum into the `feeGrowth` mechanism to be discussed later.

## 3. From tick-by-tick calculation to `feeGrowth`

The above formula gives a theoretical definition of LP returns, but it is not feasible to calculate these values on-chain on a per-transaction basis. Therefore, we need a method: not to record every transaction, but to record the "accumulated unit liquidity return", which is the core design of V3: `feeGrowth`.

We define `feeGrowth` as "the cumulative return per unit of liquidity":

<MathBlock tex={String.raw`f_g = \sum_{i=0}^{N} \frac{f_i}{L_i}`} />

It can also be expanded and written as:

<MathBlock tex={String.raw`f_g = \frac{f_0}{L_0} + \frac{f_1}{L_1} + \cdots + \frac{f_N}{L_N}`} />

In other words, `feeGrowth` represents "the fees earned so far per unit of liquidity." Note: What is recorded here is not the total fee, but fee per unit of liquidity.

So how did `feeGrowth` change? Take the example in the picture below:

![Diagram 20260422111153](/img/notes/pasted-image-20260422111153.png)

Yellow bars represent total liquidity in different tick intervals
- `L₂`, `L₃`, `L₄` represent the effective liquidity in the corresponding range
- The green polyline represents the process of accumulation of fees when the price crosses multiple intervals during the swap process.
- `f₀, f₁, f₂, f₃, f₄` represents the fee fragments generated in different steps/different intervals

The most important thing here is to understand that `f0, f1, f2, f3, f4` are not repeated fees in the same range, but incremental fees collected by swaps in different steps.

`f0`

The price has just started to move, and a transaction occurs in the first step. A fee of `f0` is charged.
The corresponding total liquidity at this time is `L0`, so its contribution to fee growth is:

<MathBlock tex={String.raw`\frac{f_0}{L_0}`} />

---
`f1`

The price continues to move along the next short path, and another transaction occurs. A fee of `f1` is charged.
At this time, the effective liquidity of the corresponding interval is `L1`, so the contribution is:

<MathBlock tex={String.raw`\frac{f_1}{L_1}`} />

---
`f2`

The price further enters the liquidity range marked `L₂` in the figure, and a transaction occurs within this range. A fee of `f2` is charged.
Therefore the contribution of this step is:

<MathBlock tex={String.raw`\frac{f_2}{L_2}`} />

---
`f3`

The price continues to advance to the next step, and the total liquidity in the corresponding range is `L₃`. A fee of `f3` is charged.
The contribution is therefore:

<MathBlock tex={String.raw`\frac{f_3}{L_3}`} />

---
`f4`

Finally, the price enters the liquidity range corresponding to `L₄`, another transaction occurs, and the fee `f4` is charged.
The contribution is therefore:

<MathBlock tex={String.raw`\frac{f_4}{L_4}`} />

Because `feeGrowth` is cumulative, it does not record the total fee from a single swap. Instead, it records the cumulative sum of the contributions of all steps to the "income per unit of liquidity" so far.

So the green polyline in the picture actually expresses:

- Add `f0 / L0` first
- plus `f1 / L1`
- plus `f2 / L2`
- plus `f3 / L3`
- plus `f4 / L4`

Every time a new step occurs, `feeGrowth` is incremented.

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

If this example is generalized, then in any swap process, `feeGrowth` can be written as:

<MathBlock tex={String.raw`f_g = \sum_{i=0}^{N} \frac{f_i}{L_i}`} />

- `f_i`: The fee charged in the `i` step
- `L_i`: The effective liquidity in the corresponding interval of the `i` step

Combined with the above figure, we can use "rules" to summarize the changes in fee growth during the swap process:

#### Rule 1: When fee collection occurs, fee growth increases

During the swap process:

- In each step, if a transaction occurs and a fee of <InlineMath tex={String.raw`f_i`} /> is charged
- And the liquidity in the current range is <InlineMath tex={String.raw`L_i`} />

Then fee growth will increase:

<MathBlock tex={String.raw`\Delta f_g = \frac{f_i}{L_i}`} />

Correspondence in the figure:

- In the tick 3 interval: <InlineMath tex={String.raw`f_0`} /> is generated -> fee growth increases by <InlineMath tex={String.raw`\frac{f_0}{L_0}`} />
- In the tick 4 interval: <InlineMath tex={String.raw`f_1`} /> is generated -> fee growth increases by <InlineMath tex={String.raw`\frac{f_1}{L_1}`} />
- In the tick 2 interval: <InlineMath tex={String.raw`f_2`} /> is generated -> fee growth increases by <InlineMath tex={String.raw`\frac{f_2}{L_2}`} />
- In the tick 3 interval: <InlineMath tex={String.raw`f_3`} /> is generated -> fee growth increases by <InlineMath tex={String.raw`\frac{f_3}{L_3}`} />
- In the tick 4 interval: <InlineMath tex={String.raw`f_4`} /> is generated -> fee growth increases by <InlineMath tex={String.raw`\frac{f_4}{L_4}`} />

---

#### Rule 2: fee growth is cumulative and will not decrease

- fee growth only increases
- It is not reduced when price reverses

Therefore:

- The dotted line (fee growth) in the graph is always upward
- There will be no decline

---

#### Rule 3: Swaps in different directions have different impacts on fee growth.

For a certain token (e.g. token Y):

- when swap is Y → X (input Y)
- A fee of Y will be charged
- fee growth increases

- when swap is X → Y (input X)
- No fee of Y
- fee growth remains unchanged

In summary, fee growth only increases when the corresponding token fee is charged, and remains unchanged in other cases.

## 4. From `feeGrowth` to `feeGrowthInside`

In the previous section, we have reached a key conclusion:

<MathBlock tex={String.raw`f = S \cdot \sum_t \sum_i \frac{f_{i,t}}{L_{i,t}}`} />

And further abstracted:

<MathBlock tex={String.raw`f_g = \sum_{i=0}^{N} \frac{f_i}{L_i}`} />

We can use `feeGrowth` to represent the accumulated fees per unit of liquidity.

But this is not enough. Although `feeGrowth` has compressed the complex sum of "across time + across ranges" into a cumulative amount, one key problem remains: an LP should only receive fees within its own price range. `feeGrowth` is a global accumulation, but an LP only cares about the part inside the [i_lower, i_upper] interval.

If we calculate by traversing all historical steps, this is completely infeasible on the chain (gas explosion). Therefore, the optimization method of V3 is to use "subtraction" instead of "traversal". It will not "find the fee within the range", but use `global fee - fee outside the range`.

### 4.1 Three key quantities

![Diagram 20260422111413](/img/notes/pasted-image-20260422111413.png)

Based on the picture, we now derive the fee inside the range as global fee minus fee outside the range. First, we must understand three key variables:

---

#### 1️⃣ Global fee growth

<MathBlock tex={String.raw`f_g`} />

Indicates the cumulative fee per unit of liquidity across all steps from the beginning of the system to the present

---

#### 2️⃣ Outside the interval (below / above)

For any tick <InlineMath tex={String.raw`i`} />:

Total below:

<MathBlock tex={String.raw`f_b(i) = \text{fee growth below tick } i`} />

Total above:

<MathBlock tex={String.raw`f_a(i) = \text{fee growth above tick } i`} />

---

#### 3️⃣ fee growth within the range

For an LP interval:

<MathBlock tex={String.raw`[i_l, i_u]`} />

definition:

<MathBlock tex={String.raw`f_{\text{inside}}(i_l, i_u)`} />

Core formula:

<MathBlock tex={String.raw`f_{\text{inside}} = f_g - f_b(i_l) - f_a(i_u)`} />

---

#### 🟥 Red on the left (below)

- means <InlineMath tex={String.raw`f_b(i_l)`} />
- That is: **fee generated on the left side of lower tick**

These fees do not belong to the current LP

#### 🟥 Red on the right (above)

- means <InlineMath tex={String.raw`f_a(i_u)`} />
- That is: **fee generated on the right side of upper tick**

Also not part of the current LP

#### 🟢 Middle green (inside)

overall situation
- I don’t want the one on the left.
- Don’t want the one on the right

The rest is the fee you should really get within the LP range.

formula:

<MathBlock tex={String.raw`\text{feeGrowthInside} = \text{global cumulative} - \text{outside-range cumulative}`} />

Namely: `feeGrowthInside = global cumulative growth - outside-range cumulative growth`

This design brings three benefits:

1. There is no need to traverse the history `O(N) → O(1)`, only the status of the current global and two boundary ticks is needed;
2. Supports any LP range. No matter when LP enters the market, what range is chosen, or how the price moves back and forth, it can be calculated using the same set of formulas;
3. There will be no gas explosion on the chain, and you only need to deposit `feeGrowthGlobal` and `feeGrowthOutside` for each tick to complete the settlement of all LP.

## 5. Fee Growth Below (cumulative below)

Let’s first focus on a fixed tick: <InlineMath tex={String.raw`i`} />. We define: <InlineMath tex={String.raw`f_b(i)`} />, which represents the cumulative fee growth that occurred below tick <InlineMath tex={String.raw`i`} /> in all historical swaps.

![Diagram 20260422111446](/img/notes/pasted-image-20260422111446.png)

As can be seen from the picture:

- The green polyline represents the change of global fee growth <InlineMath tex={String.raw`f_g`} /> over time
- The red area indicates the fee generated below tick <InlineMath tex={String.raw`i`} />

As time progresses:

- When the price is to the left of tick <InlineMath tex={String.raw`i`} />, the new fee will be calculated "below"
- When the price is to the right of tick <InlineMath tex={String.raw`i`} />, the new fee does not count as "below"

Therefore, <InlineMath tex={String.raw`f_b(i)`} /> is essentially the accumulation of all fees that occur below tick <InlineMath tex={String.raw`i`} />. However, there is a core problem here: the price moves back and forth on either side of tick <InlineMath tex={String.raw`i`} />.

This means:

- Some fees are classified as below at one point in time
- But if the price crosses the tick, the attribution of those fees changes

Therefore, <InlineMath tex={String.raw`f_b(i)`} /> is not a quantity that can be simply "linearly accumulated".

If we expand this over time, at different time points:

<MathBlock tex={String.raw`t_0 < t_1 < t_2 < t_3 < t_4`} />

You can get:

---

#### 🔹 t₀ (price is to the left of i)

- All fees occur to the left of i, no crossing
- so:

<MathBlock tex={String.raw`f_b(t_0) = f_{g0}`} />

---

#### 🔹 t₁ (price crosses i from left → right)

- The part that used to be "left" now becomes "right"
- The area below has changed sides.

Therefore, we cannot simply use `below = previous cumulative growth` to calculate, but must use `below = current global fee growth - cumulative growth already attributed to the right side`

Right now:

<MathBlock tex={String.raw`f_b(t_1) = f_{g0} - f_{g1} + f_g`} />

---

#### 🔹 t₂ (price crosses i from right → left)

- When crossing occurs, below / above are exchanged again
- Current price returns to the left
- The newly generated fee (fg2) belongs below
- Expression returns to "normal accumulation form"

<MathBlock tex={String.raw`f_b(t_2) = f_{g0} - f_{g1} + f_{g2}`} />

express:

- crossing
- Just add the new paragraph to the expression

---

#### 🔹 t₃ (price crosses i from left → right)

- Again the below and above exchange occurs
- fb = fg - the accumulated other side fee

Right now:

<MathBlock tex={String.raw`f_b(t_3) = f_{g0} - f_{g1} + f_{g2} - f_{g3} + f_g`} />

---

#### 🔹 t4 (price crosses i again from right -> left)

- crossing occurs again
- below / above swap again
- the expression is flipped again

Right now:

<MathBlock tex={String.raw`f_b(t_4) = f_{g0} - f_{g1} + f_{g2} - f_{g3} + f_{g4}`} />

---
Summarize:

- One tick per crossing:
<InlineMath tex={String.raw`f_b(i)`} /> will become: <InlineMath tex={String.raw`f_b(i) = f_g - f_b(i)`} />

- No crossing:
Just continue to accumulate new fee growth (± <InlineMath tex={String.raw`fg_k`} />)

So the overall pattern is:

<MathBlock tex={String.raw`f_b(t)

=
f_{g0} - f_{g1} + f_{g2} - f_{g3} + \cdots`} />

That is, the sign flips at every tick crossing. In actual implementation, V3 does not calculate this formula directly; it maintains the result through state updates.

Because calculating `fee_below` on-chain from this definition would require traversing all historical swaps, which is not feasible in practice because gas costs would explode.

To avoid calculating above / below directly, V3 introduces a key variable:

<MathBlock tex={String.raw`f_o(i)`} />

Define:

<MathBlock tex={String.raw`i_c = \text{current price tick}`} />

Here, <InlineMath tex={String.raw`i_c`} /> represents the tick at the current price.

then:

<MathBlock tex={String.raw`f_b(i) =

\begin{cases}
f_o(i), & i \le i_c \\
f_g - f_o(i), & i_c < i
\end{cases}`} />

Therefore, V3 does not directly store `fee growth below`; instead, it stores `feeGrowthOutside` on each tick, which is easier to update. Later, based on the current price position relative to tick <InlineMath tex={String.raw`i`} />, it recovers <InlineMath tex={String.raw`f_b(i)`} /> and <InlineMath tex={String.raw`f_a(i)`} />. Next, we continue with <InlineMath tex={String.raw`f_a(i)`} />.

## 6. Fee Growth Above

We also focus on a fixed tick: <InlineMath tex={String.raw`i`} />. We define:

<MathBlock tex={String.raw`f_a(i) = \text{fee growth above tick } i`} />

![Diagram 20260422111523](/img/notes/pasted-image-20260422111523.png)

As can be seen from the picture:

- The green polyline represents the global fee growth <InlineMath tex={String.raw`f_g`} />
- The red area indicates the fee generated above tick <InlineMath tex={String.raw`i`} />

As time progresses:

- When the price is to the right of tick <InlineMath tex={String.raw`i`} />, the new fee will be calculated "above"
- When the price is to the left of tick <InlineMath tex={String.raw`i`} />, the new fee does not belong to the above

Therefore, <InlineMath tex={String.raw`f_a(i)`} /> is essentially the accumulation of all fees that occurred above tick <InlineMath tex={String.raw`i`} />.

As with below:

- price crossing tick i
- The ownership of "above/below" will be flipped

Therefore, <InlineMath tex={String.raw`f_a(i)`} /> is not a quantity that can be simply accumulated linearly.

Observe the pattern over time (for intuition only)

Define:

<MathBlock tex={String.raw`t_0 < t_1 < t_2 < t_3 < t_4`} />

You can get:

---

#### 🔹 t₀ (price is to the right of i)

- All fees are above i
- Calculate the fee above

<MathBlock tex={String.raw`f_a(t_0) = f_g - f_{g0}`} />

---

#### 🔹 t₁ (price crosses i from right → left)

- exchange occurs above / below

<MathBlock tex={String.raw`f_a(t_1) = f_{g1} - f_{g0}`} />

---

#### 🔹 t₂(price left → right through i)

- The newly generated fee belongs to the above

<MathBlock tex={String.raw`f_a(t_2) = f_g - f_{g2} + f_{g1} - f_{g0}`} />

---

#### 🔹 t₃ (price crosses i from right → left)

- flipping happens again

<MathBlock tex={String.raw`f_a(t_3) = f_{g3} - f_{g2} + f_{g1} - f_{g0}`} />

---

#### 🔹 t₄ (price left → right through i)

<MathBlock tex={String.raw`f_a(t_4) = f_g - f_{g4} + f_{g3} - f_{g2} + f_{g1} - f_{g0}`} />

---
From these expansions it can be observed:

- Same as below, a sign flip occurs every tick crossing
- When not crossing, just continue to accumulate

These expansions only help explain the flip mechanism. The actual calculation does not use these expressions; it uses `feeGrowthOutside` to represent the above side.

We have defined:

<MathBlock tex={String.raw`f_o(i)`} />

It represents `feeGrowthOutside` recorded on the tick.

Define:

<MathBlock tex={String.raw`i_c = \text{current price tick}`} />

Here, <InlineMath tex={String.raw`i_c`} /> represents the tick at the current price.

then:

<MathBlock tex={String.raw`f_a(i) =

\begin{cases}
f_g - f_o(i), & i \le i_c \\
f_o(i), & i_c < i
\end{cases}`} />

Therefore, the above is not an independently designed quantity, but is restored by `feeGrowthOutside` plus the current price position. Below / above are essentially two perspectives of the same thing, and when crossing occurs, the attribution flips. In addition, V3 does not store separate below / above values; it only stores <InlineMath tex={String.raw`f_o(i)`} />, and recovers them from the current price position as <InlineMath tex={String.raw`f_b(i)`} /> and <InlineMath tex={String.raw`f_a(i)`} />.

## 7. Initialization and update of `feeGrowthOutside`

In the previous section, we saw:

- Neither `feeGrowthBelow` nor `feeGrowthAbove` are simple linear accumulators
- They undergo flips as the price crosses ticks
- If maintained directly according to historical definitions, all historical swaps need to be traversed on the chain, and the gas cost is unacceptable.

Therefore, V3 does not store directly:

- `f_b(i)`: cumulative fee growth below tick `i`
- `f_a(i)`: cumulative fee growth above tick `i`

Instead, for each initialized tick, store a state variable that is easier to maintain:

<MathBlock tex={String.raw`f_{out,i}`} />

It represents `feeGrowthOutside` recorded at tick `i`. The core function of this variable is to use a state quantity to compress and encode the "flip history" after the price crosses the tick multiple times. Therefore, we do not directly calculate <InlineMath tex={String.raw`f_b(i),\quad f_a(i)`} /> later.

### 7.1 Initialization rules

When tick <InlineMath tex={String.raw`i`} /> is first initialized, we need to decide which fees are currently "outside".

Assume that the current price is at tick <InlineMath tex={String.raw`i_c`} />, then:

- If <InlineMath tex={String.raw`i \le i_c`} /> (tick is to the left of current price)
- outside = the left side
- so:

<MathBlock tex={String.raw`f_{out,i} = f_g`} />

- If <InlineMath tex={String.raw`i > i_c`} /> (tick is to the right of current price)
- outside has not accumulated anything yet
- so:

<MathBlock tex={String.raw`f_{out,i} = 0`} />

When price crosses tick i:

- The original outside area becomes inside
- The original inside area becomes outside

The outside definition flips when the price crosses the tick:

<MathBlock tex={String.raw`f_{new} = f_g - f_{old}`} />

Therefore:

<MathBlock tex={String.raw`f_{out,i} = f_g - f_{out,i}`} />

This means <InlineMath tex={String.raw`f_{out,i}`} /> already implicitly records:

- Fee accumulation on the left/right side of the tick
- and the "flip result" after multiple crossings

Next, we use <InlineMath tex={String.raw`f_{out,i}`} /> to recover:

<MathBlock tex={String.raw`f_b(i), \quad f_a(i)`} />

To further calculate:

<MathBlock tex={String.raw`f_{\text{inside}}(i_{lower}, i_{upper})`} />

### 7.2 Update rules

For an LP interval <InlineMath tex={String.raw`[i_{lower},\ i_{upper}]`} />, the fee within the interval is defined as:

<MathBlock tex={String.raw`f(i_{lower}, i_{upper})

=
f_g - f_b(i_{lower}) - f_a(i_{upper})`} />

in:

- <InlineMath tex={String.raw`f_g`} />: global fee growth
- <InlineMath tex={String.raw`f_b(i_{lower})`} />: fee below the lower boundary
- <InlineMath tex={String.raw`f_a(i_{upper})`} />: fee above the upper boundary

Assume that the current price tick is <InlineMath tex={String.raw`i_c`} />:

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

You can see the calculation of fee inside, depending on:

- Current price position <InlineMath tex={String.raw`i_c`} />
- Position relative to interval <InlineMath tex={String.raw`[i_{lower}, i_{upper}]`} />

Therefore, it needs to be discussed in three situations:

1. The current price is on the left side of the range: <InlineMath tex={String.raw`i_c < i_{lower}`} />
2. The current price is within the range: <InlineMath tex={String.raw`i_{lower} \le i_c \le i_{upper}`} />
3. The current price is on the right side of the range: <InlineMath tex={String.raw`i_{upper} < i_c`} />

### Case 1: <InlineMath tex={String.raw`i_c < i_{lower}`} /> (price is on the left side of the range)

![Diagram 20260422111633](/img/notes/pasted-image-20260422111633.png)

By definition:

<MathBlock tex={String.raw`f = f_g - f_b(i_{lower}) - f_a(i_{upper})`} />

Substitute:

- Because <InlineMath tex={String.raw`i_c < i_{lower}`} />:

<MathBlock tex={String.raw`f_b(i_{lower}) = f_g - f_{out,i_{lower}}`} />

<MathBlock tex={String.raw`f_a(i_{upper}) = f_{out,i_{upper}}`} />

get:

<MathBlock tex={String.raw`\begin{aligned}

f
&= f_g - (f_g - f_{out,i_{lower}}) - f_{out,i_{upper}} \\
&= f_{out,i_{lower}} - f_{out,i_{upper}}
\end{aligned}`} />

  ---

### Case 2: <InlineMath tex={String.raw`i_{lower} \le i_c \le i_{upper}`} /> (price is within the range)

![Diagram 20260422111654](/img/notes/pasted-image-20260422111654.png)

By definition:

<MathBlock tex={String.raw`f = f_g - f_b(i_{lower}) - f_a(i_{upper})`} />

Substitute:

- Because <InlineMath tex={String.raw`i_{lower} \le i_c`} />

<MathBlock tex={String.raw`f_b(i_{lower}) = f_{out,i_{lower}}`} />

- Because <InlineMath tex={String.raw`i_c \le i_{upper}`} />

<MathBlock tex={String.raw`f_a(i_{upper}) = f_{out,i_{upper}}`} />

get:

<MathBlock tex={String.raw`f = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

---

### Case 3: <InlineMath tex={String.raw`i_{upper} < i_c`} /> (price is on the right side of the range)

![Diagram 20260422111712](/img/notes/pasted-image-20260422111712.png)

By definition:

<MathBlock tex={String.raw`f = f_g - f_b(i_{lower}) - f_a(i_{upper})`} />

Substitute:

- Because <InlineMath tex={String.raw`i_{upper} < i_c`} />

<MathBlock tex={String.raw`f_b(i_{lower}) = f_{out,i_{lower}}`} />

<MathBlock tex={String.raw`f_a(i_{upper}) = f_g - f_{out,i_{upper}}`} />

get:

<MathBlock tex={String.raw`\begin{aligned}

f
&= f_g - f_{out,i_{lower}} - (f_g - f_{out,i_{upper}}) \\
&= f_{out,i_{upper}} - f_{out,i_{lower}}
\end{aligned}`} />

The three situations are unified as follows:

<MathBlock tex={String.raw`f(i_{lower}, i_{upper}) =

\begin{cases}
f_{out,i_{lower}} - f_{out,i_{upper}}, & i_c < i_{lower} \\
f_g - f_{out,i_{lower}} - f_{out,i_{upper}}, & i_{lower} \le i_c \le i_{upper} \\
f_{out,i_{upper}} - f_{out,i_{lower}}, & i_{upper} < i_c
\end{cases}`} />

## 8. Accumulated fee calculation under uninitialized tick

In the previous section, we have obtained a unified interval fee expression:

<MathBlock tex={String.raw`f(i_{lower}, i_{upper}) =

\begin{cases}
f_{out,i_{lower}} - f_{out,i_{upper}}, & i_c < i_{lower} \\
f_g - f_{out,i_{lower}} - f_{out,i_{upper}}, & i_{lower} \le i_c \le i_{upper} \\
f_{out,i_{upper}} - f_{out,i_{lower}}, & i_{upper} < i_c
\end{cases}`} />

Next we consider a special but very important case:

> The interval boundaries <InlineMath tex={String.raw`i_{lower}, i_{upper}`} /> were not initialized when position was created.

This means that at creation time <InlineMath tex={String.raw`t_0`} />:

<MathBlock tex={String.raw`f_{out,i_{lower}} = 0, \quad f_{out,i_{upper}} = 0`} />

Also define:

<MathBlock tex={String.raw`F_0 = f(i_{lower}, i_{upper}) \text{ at } t_0`} />

<MathBlock tex={String.raw`F_k = f(i_{lower}, i_{upper}) \text{ at } t_k`} />

The goal is to calculate:

<MathBlock tex={String.raw`F_k - F_0`} />

---

### Case 1: <InlineMath tex={String.raw`i_c < i_{lower}`} /> (price is always on the left side of the range)

![Diagram 20260422111739](/img/notes/pasted-image-20260422111739.png)

Use the formula at this time:

<MathBlock tex={String.raw`f = f_{out,i_{lower}} - f_{out,i_{upper}}`} />

#### Initial time <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = 0 - 0 = 0`} />

#### At some point <InlineMath tex={String.raw`t_2`} />

Assuming that price first crosses <InlineMath tex={String.raw`i_{lower}`} /> at <InlineMath tex={String.raw`t_1`} />, then:

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_{g1}`} />

And <InlineMath tex={String.raw`i_{upper}`} /> remains untouched:

<MathBlock tex={String.raw`f_{out,i_{upper}} = 0`} />

Therefore:

<MathBlock tex={String.raw`F_2 = f_{g2} - (f_{g1} - 0) - 0 = f_{g2} - f_{g1}`} />

get:

<MathBlock tex={String.raw`F_2 - F_0 = f_{g2} - f_{g1}`} />

---

### Case 2: <InlineMath tex={String.raw`i_{lower} \le i_c \le i_{upper}`} /> (price enters the range)

![Diagram 20260422111759](/img/notes/pasted-image-20260422111759.png)

Use the formula:

<MathBlock tex={String.raw`f = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

#### Initial time <InlineMath tex={String.raw`t_0`} />

Since both ticks are uninitialized:

<MathBlock tex={String.raw`F_0 = f_{g0} - f_{g0} - 0 = 0`} />

#### At some point <InlineMath tex={String.raw`t_2`} />

Assumptions:

- <InlineMath tex={String.raw`i_{lower}`} /> has been crossed (in <InlineMath tex={String.raw`t_1`} />)
- <InlineMath tex={String.raw`i_{upper}`} /> has not been crossed yet

then:

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_{g0}, \quad f_{out,i_{upper}} = 0`} />

Therefore:

<MathBlock tex={String.raw`F_2 = f_{out,i_{upper}} - f_{out,i_{lower}} = f_{g1} - f_{g0}`} />

get:

<MathBlock tex={String.raw`F_2 - F_0 = f_{g1} - f_{g0}`} />

---

### Case 3: <InlineMath tex={String.raw`i_{upper} < i_c`} /> (price crosses the entire range)

![Diagram 20260422111821](/img/notes/pasted-image-20260422111821.png)

Use the formula:

<MathBlock tex={String.raw`f = f_{out,i_{upper}} - f_{out,i_{lower}}`} />

#### Initial time <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = 0`} />

#### At some point <InlineMath tex={String.raw`t_2`} />

Assumptions:

- <InlineMath tex={String.raw`i_{lower}`} /> is initialized before <InlineMath tex={String.raw`t_0`} />
- <InlineMath tex={String.raw`i_{upper}`} /> is crossed at <InlineMath tex={String.raw`t_1`} />

then:

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_{g0}, \quad f_{out,i_{upper}} = f_{g1}`} />

Therefore:

<MathBlock tex={String.raw`F_2 = f_{g2} - f_{g0} - (f_{g1} - f_{g0}) = f_{g2} - f_{g1}`} />

get:

<MathBlock tex={String.raw`F_2 - F_0 = f_{g2} - f_{g1}`} />

---

Regardless of the current price's position relative to the range (left/inside/right), in the case where the boundary tick is not initialized initially, there is:

<MathBlock tex={String.raw`F_k - F_0 = f_{g,k} - f_{g,\text{entry}}`} />

- Before the tick is initialized, the interval boundary does not form a division
- So fee growth will not be assigned to outside
- Fee accumulation in the entire interval is equivalent to changes in global fee growth

## 9. lower has been initialized, upper has not been initialized

In the previous section, we analyzed that both ticks were not initialized, and now we enter a more critical intermediate state:

> **<InlineMath tex={String.raw`i_{lower}`} /> has been initialized, <InlineMath tex={String.raw`i_{upper}`} /> has not been initialized**

Initial state (when position is created)

Assume position is created at <InlineMath tex={String.raw`t_0`} /> and the current price is <InlineMath tex={String.raw`i_c`} />

because:

- <InlineMath tex={String.raw`i_{lower}`} /> initialized
- <InlineMath tex={String.raw`i_{upper}`} /> not initialized

Therefore:

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_L \neq 0`} />

<MathBlock tex={String.raw`f_{out,i_{upper}} = 0`} />

in:

<MathBlock tex={String.raw`f_L = f_{out,i_{lower}} \text{ at } t_0`} />

definition:

<MathBlock tex={String.raw`F_0 = f(i_{lower}, i_{upper}) \text{ at } t_0`} />

<MathBlock tex={String.raw`F_k = f(i_{lower}, i_{upper}) \text{ at } t_k`} />

The goal remains:

<MathBlock tex={String.raw`F_k - F_0`} />

---

## Case 1: <InlineMath tex={String.raw`i_c < i_{lower}`} /> (price is on the left side of the range)

![Diagram 20260422111851](/img/notes/pasted-image-20260422111851.png)

at this time:

<MathBlock tex={String.raw`f = f_{out,i_{lower}} - f_{out,i_{upper}}`} />

Initial time <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = f_L - 0 = f_L`} />

At some point <InlineMath tex={String.raw`t_2`} />

When the price crosses <InlineMath tex={String.raw`i_{lower}`} /> at <InlineMath tex={String.raw`t_1`} />, a flip occurs:

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_g - f_{out,i_{lower}}`} />

Right now:

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_{g1} - f_L`} />

and:

<MathBlock tex={String.raw`f_{out,i_{upper}} = 0`} />

Therefore:

<MathBlock tex={String.raw`F_2 = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

Substitute:

<MathBlock tex={String.raw`F_2 = f_{g2} - (f_{g1} - f_L) - 0`} />

Difference

<MathBlock tex={String.raw`\begin{aligned}

F_2 - F_0
&= f_{g2} - (f_{g1} - f_L) - f_L \\
&= f_{g2} - f_{g1}
\end{aligned}`} />

---

## Case 2: <InlineMath tex={String.raw`i_{lower} \le i_c \le i_{upper}`} /> (price enters the range)

![Diagram 20260422111911](/img/notes/pasted-image-20260422111911.png)

at this time:

<MathBlock tex={String.raw`f = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

Initial time <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = f_{g0} - f_L - 0`} />

At some point <InlineMath tex={String.raw`t_2`} />

at this time:

- <InlineMath tex={String.raw`i_{lower}`} /> has been passed through (or is already on the left)
- <InlineMath tex={String.raw`i_{upper}`} /> has not been crossed yet

Therefore:

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_L`} />

<MathBlock tex={String.raw`f_{out,i_{upper}} = 0`} />

<MathBlock tex={String.raw`F_2 = f_{out,i_{upper}} - f_{out,i_{lower}}`} />

<MathBlock tex={String.raw`F_2 = f_{g1} - f_L`} />

Difference

<MathBlock tex={String.raw`\begin{aligned}

F_2 - F_0
&= (f_{g1} - f_L) - (f_{g0} - f_L) \\
&= f_{g1} - f_{g0}
\end{aligned}`} />

---

## Case 3: <InlineMath tex={String.raw`i_{upper} < i_c`} /> (price crosses upper)

![Diagram 20260422111929](/img/notes/pasted-image-20260422111929.png)

at this time:

<MathBlock tex={String.raw`f = f_{out,i_{upper}} - f_{out,i_{lower}}`} />

Initial time <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = f_{g0} - f_L`} />

At some point <InlineMath tex={String.raw`t_2`} />

Assumptions:

- <InlineMath tex={String.raw`i_{upper}`} /> is first crossed (initialized) at <InlineMath tex={String.raw`t_1`} />
- flip occurs at the same time:

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_{g1}`} />

Therefore:

<MathBlock tex={String.raw`F_2 = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

Substitute:

<MathBlock tex={String.raw`F_2 = f_{g2} - f_L - (f_{g1} - f_{g0})`} />

Difference

<MathBlock tex={String.raw`\begin{aligned}

F_2 - F_0
&= f_{g2} - f_L - (f_{g1} - f_{g0}) - (f_{g0} - f_L) \\
&= f_{g2} - f_{g1}
\end{aligned}`} />

---
This section explains: As long as upper has not been initialized, the "right boundary" of the interval will not truncate "fee".

Therefore:

- fee is still only truncated once by lower
- The overall effect is still equivalent to:

<MathBlock tex={String.raw`\Delta f_{\text{inside}} = \Delta f_g`} />

## 10. upper has been initialized, lower has not been initialized

In the previous section, we analyzed that **<InlineMath tex={String.raw`i_{lower}`} /> is initialized and <InlineMath tex={String.raw`i_{upper}`} /> is not initialized. Now we consider the completely symmetric case:

> <InlineMath tex={String.raw`i_{upper}`} /> has been initialized, <InlineMath tex={String.raw`i_{lower}`} /> has not been initialized

Initial state (when position is created)

Assume position is created at <InlineMath tex={String.raw`t_0`} /> and the current price is <InlineMath tex={String.raw`i_c`} />

because:

- <InlineMath tex={String.raw`i_{lower}`} /> not initialized
- <InlineMath tex={String.raw`i_{upper}`} /> initialized

Therefore:

<MathBlock tex={String.raw`f_{out,i_{lower}} = 0`} />

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_U \neq 0`} />

in:

<MathBlock tex={String.raw`f_U = f_{out,i_{upper}} \text{ at } t_0`} />

definition:

<MathBlock tex={String.raw`F_0 = f(i_{lower}, i_{upper}) \text{ at } t_0`} />

<MathBlock tex={String.raw`F_k = f(i_{lower}, i_{upper}) \text{ at } t_k`} />

The goal remains:

<MathBlock tex={String.raw`F_k - F_0`} />

---

## Case 1: <InlineMath tex={String.raw`i_c < i_{lower}`} /> (price is on the left side of the range)

![Diagram 20260424103215](/img/notes/pasted-image-20260424103215.png)

at this time:

<MathBlock tex={String.raw`f = f_{out,i_{lower}} - f_{out,i_{upper}}`} />

Initial time <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = 0 - f_U`} />

At some point <InlineMath tex={String.raw`t_2`} />

Price crosses <InlineMath tex={String.raw`i_{lower}`} /> at <InlineMath tex={String.raw`t_1`} /> (first initialization):

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_{g1}`} />

and:

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_U`} />

Therefore:

<MathBlock tex={String.raw`F_2 = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

Substitute:

<MathBlock tex={String.raw`F_2 = f_{g2} - f_{g1} - f_U`} />

Difference

<MathBlock tex={String.raw`\begin{aligned}

F_2 - F_0
&= (f_{g2} - f_{g1} - f_U) - (0 - f_U) \\
&= f_{g2} - f_{g1}
\end{aligned}`} />

---

## Case 2: <InlineMath tex={String.raw`i_{lower} \le i_c \le i_{upper}`} /> (price is within the range)

![Diagram 20260424103229](/img/notes/pasted-image-20260424103229.png)

at this time:

<MathBlock tex={String.raw`f = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

Initial time <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = f_{g0} - 0 - f_U`} />

At some point <InlineMath tex={String.raw`t_2`} />

at this time:

- <InlineMath tex={String.raw`i_{lower}`} /> has not been initialized yet
- <InlineMath tex={String.raw`i_{upper}`} /> already exists

Therefore:

<MathBlock tex={String.raw`f_{out,i_{lower}} = 0`} />

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_U`} />

<MathBlock tex={String.raw`F_2 = f_{out,i_{upper}} - f_{out,i_{lower}}`} />

<MathBlock tex={String.raw`F_2 = f_{g1} - f_U`} />

Difference

<MathBlock tex={String.raw`\begin{aligned}

F_2 - F_0
&= (f_{g1} - f_U) - (f_{g0} - f_U) \\
&= f_{g1} - f_{g0}
\end{aligned}`} />

---

## Case 3: <InlineMath tex={String.raw`i_{upper} < i_c`} /> (price is on the right side of the range)

![Diagram 20260424103243](/img/notes/pasted-image-20260424103243.png)

at this time:

<MathBlock tex={String.raw`f = f_{out,i_{upper}} - f_{out,i_{lower}}`} />

Initial time <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = f_U - 0 = f_U`} />

At some point <InlineMath tex={String.raw`t_2`} />

The price crosses <InlineMath tex={String.raw`i_{upper}`} /> at <InlineMath tex={String.raw`t_1`} />, and a flip occurs:

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_g - f_{out,i_{upper}}`} />

Right now:

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_{g1} - f_U`} />

Therefore:

<MathBlock tex={String.raw`F_2 = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

Substitute:

<MathBlock tex={String.raw`F_2 = f_{g2} - 0 - (f_{g1} - f_U)`} />

Difference

<MathBlock tex={String.raw`\begin{aligned}

F_2 - F_0
&= (f_{g2} - f_{g1} + f_U) - f_U \\
&= f_{g2} - f_{g1}
\end{aligned}`} />

This section forms a completely symmetrical relationship with the previous section:

- lower initialization → truncate left fee
- upper initialization → truncate the right fee

But as long as the other side is uninitialized: the interval still does not form a "complete boundary".

Therefore:

- fee is truncated on one side only
- Overall still equivalent to global fee growth

## 11. lower and upper are both initialized (complete range)

In the previous sections we have shown that:

- uninitialized on both sides → equivalent to global
- only lower → equivalent to global
- only upper → equivalent to global

Now onto the **last case**:

> **<InlineMath tex={String.raw`i_{lower}`} /> and <InlineMath tex={String.raw`i_{upper}`} /> have been initialized**

Initial state (when position is created)

Assume position is created at <InlineMath tex={String.raw`t_0`} /> and the current price is <InlineMath tex={String.raw`i_c`} />

at this time:

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_L`} />

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_U`} />

in:

<MathBlock tex={String.raw`f_L = f_{out,i_{lower}} \text{ at } t_0`} />

<MathBlock tex={String.raw`f_U = f_{out,i_{upper}} \text{ at } t_0`} />

definition:

<MathBlock tex={String.raw`F_0 = f(i_{lower}, i_{upper}) \text{ at } t_0`} />

<MathBlock tex={String.raw`F_k = f(i_{lower}, i_{upper}) \text{ at } t_k`} />

Target:

<MathBlock tex={String.raw`F_k - F_0`} />

---

## Case 1: <InlineMath tex={String.raw`i_c < i_{lower}`} /> (price is on the left side of the range)

![Diagram 20260424102554](/img/notes/pasted-image-20260424102554.png)

at this time:

<MathBlock tex={String.raw`f = f_{out,i_{lower}} - f_{out,i_{upper}}`} />

Initial time <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = f_L - f_U`} />

At some point <InlineMath tex={String.raw`t_2`} />

The price crosses <InlineMath tex={String.raw`i_{lower}`} /> at <InlineMath tex={String.raw`t_1`} />, and a flip occurs:

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_g - f_{out,i_{lower}} = f_{g1} - f_L`} />

and:

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_U`} />

<MathBlock tex={String.raw`F_2 = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

Substitute:

<MathBlock tex={String.raw`F_2 = f_{g2} - (f_{g1} - f_L) - f_U`} />

Difference

<MathBlock tex={String.raw`\begin{aligned}

F_2 - F_0
&= f_{g2} - (f_{g1} - f_L) - f_U - (f_L - f_U) \\
&= f_{g2} - f_{g1}
\end{aligned}`} />

---

## Case 2: <InlineMath tex={String.raw`i_{lower} \le i_c \le i_{upper}`} /> (price is within the range)

![Diagram 20260424102701](/img/notes/pasted-image-20260424102701.png)

at this time:

<MathBlock tex={String.raw`f = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

Initial time <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = f_{g0} - f_L - f_U`} />

At some point <InlineMath tex={String.raw`t_2`} />

at this time:

- lower on the left
- upper on the right

Therefore:

<MathBlock tex={String.raw`f_{out,i_{lower}} = f_L`} />

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_U`} />

<MathBlock tex={String.raw`F_2 = f_{out,i_{upper}} - f_{out,i_{lower}}`} />

<MathBlock tex={String.raw`F_2 = f_{g1} - f_U - f_L`} />

Difference

<MathBlock tex={String.raw`\begin{aligned}

F_2 - F_0
&= (f_{g1} - f_U - f_L) - (f_{g0} - f_L - f_U) \\
&= f_{g1} - f_{g0}
\end{aligned}`} />

---

## Case 3: <InlineMath tex={String.raw`i_{upper} < i_c`} /> (price is on the right side of the range)

![Diagram 20260424102846](/img/notes/pasted-image-20260424102846.png)

at this time:

<MathBlock tex={String.raw`f = f_{out,i_{upper}} - f_{out,i_{lower}}`} />

Initial time <InlineMath tex={String.raw`t_0`} />

<MathBlock tex={String.raw`F_0 = f_U - f_L`} />

At some point <InlineMath tex={String.raw`t_2`} />

The price crosses <InlineMath tex={String.raw`i_{upper}`} /> at <InlineMath tex={String.raw`t_1`} />, and a flip occurs:

<MathBlock tex={String.raw`f_{out,i_{upper}} = f_{g1} - f_U`} />

<MathBlock tex={String.raw`F_2 = f_g - f_{out,i_{lower}} - f_{out,i_{upper}}`} />

Substitute:

<MathBlock tex={String.raw`F_2 = f_{g2} - f_L - (f_{g1} - f_U)`} />

Difference

<MathBlock tex={String.raw`\begin{aligned}

F_2 - F_0
&= f_{g2} - f_L - (f_{g1} - f_U) - (f_U - f_L) \\
&= f_{g2} - f_{g1}
\end{aligned}`} />
