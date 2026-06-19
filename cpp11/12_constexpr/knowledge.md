# Modern C++11 - Day 12: `constexpr`

## 1. Goal

After learning `constexpr`, you should understand:

```text
1. What compile-time evaluation means.
2. Why C++11 introduced constexpr.
3. The difference between const and constexpr.
4. How to write simple constexpr variables and functions.
5. Common mistakes when using constexpr.
```

---

## 2. What Problem Does It Solve?

`constexpr` means a value or function can be evaluated at compile time.

Before C++11, compile-time constants were often written with macros or simple `const` variables.

```cpp
#define MAX_ORDERS 1000
const int maxOrders = 1000;
```

C++11 introduced `constexpr` to express compile-time constants more clearly and safely.

```cpp
constexpr int maxOrders = 1000;
```

Main idea:

```text
Use constexpr when a value should be known at compile time.
```

---

## 3. Minimum Syntax

Compile-time variable:

```cpp
constexpr int maxOrders = 1000;
constexpr double tickSize = 0.01;
```

Compile-time function:

```cpp
constexpr int square(int x) {
    return x * x;
}
```

Use it:

```cpp
constexpr int value = square(10);
```

---

## 4. `const` vs `constexpr`

`const` means the variable cannot be modified after initialization.

```cpp
const int x = 10;
```

`constexpr` means the value can be known at compile time.

```cpp
constexpr int x = 10;
```

Simple rule:

```text
const     = cannot be changed
constexpr = compile-time constant when possible
```

Not every `const` is compile-time.

```cpp
int n;
std::cin >> n;
const int x = n; // const, but not compile-time
```

---

## 5. Common Mistakes

### 5.1. Thinking all const values are constexpr

```cpp
int n;
std::cin >> n;

const int x = n;
```

`x` is const, but its value is only known at runtime.

---

### 5.2. Using runtime values in constexpr variables

```cpp
int n;
std::cin >> n;

constexpr int x = n; // Error
```

A `constexpr` variable must be initialized with a compile-time value.

---

### 5.3. Writing complex C++11 constexpr functions

C++11 constexpr functions are limited.

They should be simple and usually contain one return statement.

---

## 6. When Should You Use `constexpr`?

Use `constexpr` when:

```text
1. The value should be known at compile time.
2. You define constants such as sizes, limits, or fixed parameters.
3. You write small pure functions for compile-time calculation.
4. You want safer alternatives to macros.
```

Avoid it when:

```text
1. The value depends on user input.
2. The value depends on runtime data.
3. The logic is too complex for C++11 constexpr.
```

---

## 7. Notes for Trading / Performance-Sensitive Code

Trading systems often use fixed constants:

```text
Maximum orders
Price scale
Lot size
Tick size
Risk limits
Array sizes
```

Example:

```cpp
constexpr int MaxOrders = 1000;
constexpr double TickSize = 0.01;
```

`constexpr` makes these constants explicit and available at compile time.

---

## 8. End-of-Day Checklist

You should remember:

```text
constexpr = can be evaluated at compile time
```

You should be able to answer:

```text
1. What does constexpr mean?
2. What is the difference between const and constexpr?
3. Can constexpr depend on user input?
4. Why is constexpr better than macro constants?
5. When is a constexpr function useful?
```

---

## 9. Conclusion

`constexpr` is used for values and functions that can be evaluated at compile time.

The key idea:

```text
Use constexpr for true compile-time constants.
Use const when you only need immutability.
```

::: 
