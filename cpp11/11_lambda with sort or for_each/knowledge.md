# Modern C++11 - Day 11: Lambda with `sort` and `for_each`

## 1. Goal

After learning lambda with `sort` and `for_each`, you should understand:

```text
1. Why lambdas are useful with STL algorithms.
2. How to write custom sorting rules with lambda.
3. How to apply an action to every element with for_each.
4. Common mistakes when using lambdas with algorithms.
5. How this style appears in real-world C++ code.
```

---

## 2. What Problem Does It Solve?

STL algorithms often need custom logic.

For sorting, you need a comparator:

```cpp
std::sort(v.begin(), v.end(), [](int a, int b) {
    return a < b;
});
```

For applying an action to every element, you can use `for_each`:

```cpp
std::for_each(v.begin(), v.end(), [](int x) {
    std::cout << x << '\n';
});
```

Main idea:

```text
Lambda lets you pass small custom behavior directly into STL algorithms.
```

---

## 3. `sort` with Lambda

Basic syntax:

```cpp
std::sort(begin, end, comparator);
```

Comparator lambda:

```cpp
[](const T& a, const T& b) {
    return a.field < b.field;
}
```

Example:

```cpp
std::sort(orders.begin(), orders.end(), [](const Order& a, const Order& b) {
    return a.price < b.price;
});
```

Rule:

```text
Return true if a should come before b.
```

---

## 4. `for_each` with Lambda

Basic syntax:

```cpp
std::for_each(begin, end, action);
```

Action lambda:

```cpp
[](const T& item) {
    // do something with item
}
```

Example:

```cpp
std::for_each(orders.begin(), orders.end(), [](const Order& order) {
    std::cout << order.symbol << '\n';
});
```

Use `const T&` when you only read.

Use `T&` when you want to modify elements.

---

## 5. Common Mistakes

### 5.1. Wrong comparator logic

```cpp
return a.price <= b.price;
```

A sort comparator should normally use strict comparison:

```cpp
return a.price < b.price;
```

Do not use `<=` for sorting.

---

### 5.2. Copying large objects

Avoid:

```cpp
[](Order order) { ... }
```

Prefer:

```cpp
[](const Order& order) { ... }
```

This avoids unnecessary copies.

---

### 5.3. Modifying elements accidentally

Use `const T&` when reading only.

Use `T&` only when modification is intended.

---

### 5.4. Using `for_each` when a range-based for loop is clearer

For simple loops, range-based for may be easier to read.

Use `for_each` when it fits algorithm-style code.

---

## 6. When Should You Use It?

Use lambda with `sort` when:

```text
1. You need a custom ordering rule.
2. The rule is short and local.
3. You want to sort structs or objects by a field.
```

Use lambda with `for_each` when:

```text
1. You want to apply a small action to every element.
2. You want algorithm-style code.
3. You need to combine with captures.
```

---

## 7. Notes for Trading / Performance-Sensitive Code

Trading code often sorts and processes data:

```text
Sort orders by price.
Sort trades by timestamp.
Print or normalize market data.
Compute notional for every trade.
```

Example ideas:

```cpp
std::sort(orders.begin(), orders.end(), [](const Order& a, const Order& b) {
    return a.price < b.price;
});
```

```cpp
std::for_each(trades.begin(), trades.end(), [](const Trade& trade) {
    // process trade
});
```

Prefer references to avoid unnecessary copies.

---

## 8. End-of-Day Checklist

You should remember:

```text
sort comparator: return true if a should come before b.
for_each action: do something for every element.
```

You should be able to answer:

```text
1. What does a sort comparator return?
2. Why should sort use < instead of <=?
3. Why use const T& in lambdas?
4. When should for_each use T&?
5. When is range-based for clearer than for_each?
```

---

## 9. Conclusion

Lambda works naturally with STL algorithms.

The key idea:

```text
Use lambda to pass short, local behavior into sort and for_each.
Keep the lambda small, clear, and efficient.
```

::: 
