---
id: overview
title: 00 Protocol Overview
sidebar_label: 00 Protocol Overview
slug: /
---

import InlineMath from '@site/src/components/InlineMath';
import MathBlock from '@site/src/components/MathBlock';

## Overview

In Uniswap V2, liquidity is evenly distributed across the entire price range `(0, ∞)`. This means that no matter where the price is, the pool is always able to provide liquidity and the entire AMM curve (`x * y = k`) is backed by real funds.

However, the occurrence of transactions has obvious "locality": when the price changes, the state point will only move a small path along the curve.
That is, only a small part of the liquidity near the current price participated in this transaction.

In other words: liquidity is globally distributed, but transactions only consume liquidity within a local range.

This brings up a key problem: most of the liquidity is not involved in transactions at any time, but is passively distributed elsewhere in the price range, resulting in low capital utilization.

![Diagram 20260331151223](/img/notes/pasted-image-20260331151223.png)

As you can see from the image, although the entire curve is supported by liquidity, one trade only moves a small path along the curve (yellow arc on the right), which means that most of the liquidity is not used in this transaction.

So a natural question is: is it possible to provide liquidity only around this stretch of path? This is exactly the core idea of ​​Uniswap V3.

In V3, liquidity is no longer distributed across the entire price range, but concentrated within a limited range `[p_lower, p_upper]` (represented by P of A and P of B in the white paper).

![Diagram 20260331165852](/img/notes/pasted-image-20260331165852.png)

The orange area in the picture on the left represents the interval liquidity provided. The liquidity is no longer globally distributed, but concentrated within a limited interval. If we zoom in on this orange range, we can see that in the range on the right, the price still moves along a curve similar to `x * y = k`. However, it should be noted that this curve itself does not exist independently, but is embedded in a more complete AMM curve.

In order to maintain a continuous and consistent price function while only providing local liquidity, V3 introduces virtual liquidity. Its essence is to introduce an offset `x_virtual, y_virtual` in the x and y directions to embed the current true state `(x, y)` into a larger coordinate system, so that the state still falls on a complete AMM curve.

![Diagram 20260331170233](/img/notes/pasted-image-20260331170233.png)

After introducing virtual liquidity, we can embed the current state into a complete constant product curve:

<MathBlock tex={String.raw`(x_R + x_V)(y_R + y_V) = L^2`} />

in:

- <InlineMath tex={String.raw`x_R, y_R`} />: real reserves
- <InlineMath tex={String.raw`x_V, y_V`} />: virtual reserves
- <InlineMath tex={String.raw`L`} />: Liquidity
