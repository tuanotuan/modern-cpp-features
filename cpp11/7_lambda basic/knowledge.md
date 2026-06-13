# Modern C++11 - Day 7: Basic Lambda

## 1. Goal

After learning basic lambda expressions, you should understand:

```text
1. Why C++11 introduced lambdas.
2. The minimum lambda syntax.
3. How to use lambdas with STL algorithms.
4. Common mistakes when writing basic lambdas.
5. How lambdas improve readability in real-world C++ code.
```

---

## 2. What Problem Does Lambda Solve?

A lambda is a small unnamed function that can be written directly where it is needed.

Before lambdas, simple custom logic often required a separate function or function object.

With lambdas, you can write local behavior inline:

```cpp
auto isLargeOrder = [](int quantity) {
    return quantity > 1000;
};
```

Main idea:

```text
Use lambda when you need a small function for local, short-lived logic.
```

---

## 3. Minimum Syntax

Basic lambda syntax:

```cpp
[]() {
    // body
};
```

Lambda with parameters:

```cpp
[](int x) {
    return x > 0;
};
```

Store a lambda in a variable:

```cpp
auto isPositive = [](int x) {
    return x > 0;
};
```

Call it:

```cpp
isPositive(10);
```

Lambda used directly in an algorithm:

```cpp
std::sort(v.begin(), v.end(), [](int a, int b) {
    return a < b;
});
```

---

## 4. Basic Structure

A lambda has this general shape:

```text
[capture](parameters) -> return_type {
    body
}
```

For basic lambdas, focus on:

```text
[]           = capture list, empty for now
(parameters) = input values
body         = logic
return       = result
```

Example:

```cpp
auto isBuyOrder = [](int side) {
    return side == 1;
};
```

---

## 5. Common Mistakes

### 5.1. Forgetting to call the lambda

```cpp
auto f = []() {
    return 10;
};
```

This only creates the lambda.

To execute it:

```cpp
int x = f();
```

---

### 5.2. Writing unclear lambdas

Avoid putting too much logic inside one lambda.

A lambda should usually be short and focused.

---

### 5.3. Using lambda when a named function is clearer

If the logic is reused many times or is domain-important, a named function may be better.

---

### 5.4. Forgetting the return value

For predicates, the lambda must return `true` or `false`.

```cpp
auto isActive = [](int status) {
    return status == 1;
};
```

---

## 6. When Should You Use Lambda?

Use lambda when:

```text
1. The logic is short.
2. The logic is used locally.
3. You need a custom condition.
4. You need a custom sort rule.
5. You are using STL algorithms.
```

Avoid lambda when:

```text
1. The logic is long.
2. The logic is reused in many places.
3. A clear named function would be easier to read.
```

---

## 7. Notes for Trading / Performance-Sensitive Code

Trading code often needs small local rules:

```text
Sort orders by price.
Filter large trades.
Find active orders.
Check whether quantity exceeds a threshold.
```

Lambdas are useful for these local rules:

```cpp
auto isLargeOrder = [](const Order& order) {
    return order.quantity > 1000;
};
```

They make code concise without creating many small one-time functions.

---

## 8. End-of-Day Checklist

You should remember:

```text
[](...) { ... }
```

You should be able to answer:

```text
1. What is a lambda?
2. Why is a lambda useful?
3. What does [] mean?
4. How do you store and call a lambda?
5. When should you avoid using a lambda?
```

---

## 9. Conclusion

A lambda is a small unnamed function written directly where it is needed.

The key idea:

```text
Use lambdas for short, local logic.
Keep basic lambdas simple before learning captures and mutable lambdas.
```

::: 
