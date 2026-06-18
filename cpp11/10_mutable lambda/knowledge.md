# Modern C++11 - Day 10: Mutable Lambda

## 1. Goal

After learning mutable lambda, you should understand:

```text
1. Why mutable lambdas exist.
2. How capture by value behaves by default.
3. What the `mutable` keyword changes.
4. Common mistakes when using mutable lambdas.
5. When mutable lambdas are useful in real-world C++ code.
```

---

## 2. What Problem Does It Solve?

By default, variables captured by value cannot be modified inside a lambda.

```cpp
int count = 0;

auto f = [count]() {
    count++; // Error
};
```

`mutable` allows the lambda to modify its own copied value.

```cpp
int count = 0;

auto f = [count]() mutable {
    count++;
};
```

Main idea:

```text
mutable allows a lambda to modify its internal copy of captured-by-value variables.
```

---

## 3. Minimum Syntax

Capture by value:

```cpp
int x = 10;

auto f = [x]() {
    return x;
};
```

Capture by value with mutable:

```cpp
int x = 10;

auto f = [x]() mutable {
    x++;
    return x;
};
```

Call the lambda:

```cpp
f();
```

Important:

```text
The original variable outside the lambda is not changed.
Only the lambda's internal copy is changed.
```

---

## 4. Capture by Value vs Mutable Lambda

Without mutable:

```cpp
int x = 10;

auto f = [x]() {
    x++; // Error
};
```

With mutable:

```cpp
int x = 10;

auto f = [x]() mutable {
    x++;
    return x;
};
```

The lambda can modify its own copy of `x`.

But the original `x` remains unchanged.

---

## 5. Common Mistakes

### 5.1. Thinking mutable changes the original variable

```cpp
int x = 10;

auto f = [x]() mutable {
    x++;
};

f();
```

The original `x` is still `10`.

---

### 5.2. Confusing mutable with reference capture

Mutable changes the lambda's copied value.

Reference capture changes the original variable.

```text
[x] mutable = modify internal copy
[&x]        = modify original x
```

---

### 5.3. Overusing mutable

If the logic depends heavily on changing state, a normal function or a small class may be clearer.

Mutable lambdas should usually be short and local.

---

## 6. When Should You Use Mutable Lambda?

Use mutable lambda when:

```text
1. You capture a value.
2. You want the lambda to keep and update its own private state.
3. You do not want to modify the original variable.
4. The lambda is short and local.
```

Avoid it when:

```text
1. You actually need to modify the original variable.
2. The stateful logic is complex.
3. The lambda becomes hard to reason about.
```

---

## 7. Notes for Trading / Performance-Sensitive Code

Mutable lambdas can be useful for small local counters or stateful filters.

Example idea:

```cpp
int seen = 0;

auto countLargeOrders = [seen](const Order& order) mutable {
    if (order.quantity > 1000) {
        seen++;
    }
    return seen;
};
```

This updates the lambda's internal `seen`, not the original variable.

For shared accumulation, prefer reference capture.

---

## 8. End-of-Day Checklist

You should remember:

```text
[x] mutable = capture x by value, then allow modifying the lambda's copy
```

You should be able to answer:

```text
1. Why does [x] not allow x++ by default?
2. What does mutable allow?
3. Does mutable modify the original variable?
4. What is the difference between [x] mutable and [&x]?
5. When should you avoid mutable lambdas?
```

---

## 9. Conclusion

Mutable lambda allows modification of captured-by-value variables inside the lambda.

The key idea:

```text
mutable changes the lambda's internal copy, not the original outside variable.
Use it for small local state, and avoid overusing it.
```

::: 
