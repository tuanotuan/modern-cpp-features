# Modern C++11 - Day 1: `auto`

## 1. Goal

After learning `auto`, you should understand:

```text
1. What problem `auto` solves.
2. The minimum syntax of `auto`.
3. When to use `auto`, `auto&`, and `const auto&`.
4. Common mistakes when using `auto`.
5. How to use `auto` in real-world code, especially performance-sensitive code.
```

---

## 2. What problem does `auto` solve?

`auto` allows the compiler to automatically infer the data type from the right-hand side.

Example:

```cpp
auto x = 10;          // int
auto y = 3.14;        // double
auto it = v.begin();  // iterator
```

Before C++11, many types were very long, especially iterator types:

```cpp
std::vector<std::pair<std::string, double>>::iterator it = prices.begin();
```

Using `auto`:

```cpp
auto it = prices.begin();
```

`auto` helps with:

```text
1. Shorter code.
2. Avoiding long type names.
3. Avoiding mistakes when writing iterator types.
4. Making code easier to maintain when return types change.
```

But remember carefully:

```text
`auto` is not a dynamic type like in Python.
```

The type is still determined at compile time.

Example:

```cpp
auto x = 10; // x is int
x = 3.14;    // 3.14 is converted to int
```

---

## 3. Minimum syntax

### 3.1. Normal variables

```cpp
auto x = 10;        // int
auto y = 3.14;      // double
auto c = 'A';       // char
auto s = "ABC";     // const char*
```

Be careful:

```cpp
auto s = "ABC";
```

`s` is not `std::string`; it is `const char*`.

If you want `std::string`:

```cpp
auto s = std::string("ABC");
```

---

### 3.2. Using `auto` with iterators

```cpp
auto it = v.begin();
```

Instead of writing a long type like:

```cpp
std::vector<int>::iterator it = v.begin();
```

---

### 3.3. Using `auto` in range-based for loops

```cpp
for (auto x : v)
```

`x` is a copy.

```cpp
for (auto& x : v)
```

`x` is a reference, so it can modify the actual element.

```cpp
for (const auto& x : v)
```

`x` is a read-only reference, avoiding unnecessary copies.

---

## 4. Difference between `auto`, `auto&`, and `const auto&`

This is the most important part.

```cpp
auto x = value;
```

This means copy.

```cpp
auto& x = value;
```

This means reference, so it can modify the original variable.

```cpp
const auto& x = value;
```

This means read-only reference, avoiding unnecessary copies.

Summary:

```text
auto        = copy
auto&       = reference
const auto& = read-only reference
```

---

## 5. Common mistakes when using `auto`

### 5.1. Thinking `auto` is a dynamic type

Wrong:

```cpp
auto x = 10;
x = "hello";
```

Reason: `x` is already an `int`.

---

### 5.2. Forgetting `&`, so the original data is not modified

Wrong if you want to modify the actual vector:

```cpp
for (auto x : v) {
    x = 0;
}
```

Because `x` is only a copy.

Correct:

```cpp
for (auto& x : v) {
    x = 0;
}
```

---

### 5.3. Copying heavy objects

Not recommended if the object is large:

```cpp
for (auto tick : ticks)
```

Because each loop iteration copies one `tick`.

Better if you only read the data:

```cpp
for (const auto& tick : ticks)
```

In trading code, data such as ticks, order books, and trade events can be very large. Unnecessary copying can reduce performance.

---

### 5.4. Confusing string literals with `std::string`

```cpp
auto symbol = "AAPL";
```

`symbol` is `const char*`, not `std::string`.

If you want a real string:

```cpp
auto symbol = std::string("AAPL");
```

---

### 5.5. Overusing `auto`, making code harder to read

You should not write:

```cpp
auto x = f();
```

if it is unclear what `f()` returns.

Better:

```cpp
OrderBook book = loadOrderBook();
```

Or if you still use `auto`, give the variable a clear name:

```cpp
auto best_bid_price = order_book.bestBidPrice();
```

---

## 6. When should you use `auto`?

Use `auto` when:

```text
1. The type is too long.
2. You are using iterators.
3. You are iterating through a container with a range-based for loop.
4. The right-hand side already makes the type clear.
5. You are using lambdas or generic code.
```

Good examples:

```cpp
auto it = prices.begin();
auto price = order.bestBidPrice();
```

---

## 7. When should you avoid using `auto`?

Avoid using `auto` when:

```text
1. The type is important for the reader to understand immediately.
2. The right-hand side is an unclear function such as f(), get(), or parse().
3. It may cause confusion, such as auto s = "ABC".
4. The code needs to clearly express a domain-specific type.
```

Example where explicit types are better:

```cpp
OrderBook book = loadOrderBook();
Price price = parsePrice(raw);
Quantity qty = parseQuantity(raw);
```

---

## 8. Notes for trading / performance-sensitive code

In code that processes large amounts of data:

```cpp
for (auto x : container)
```

may cause unnecessary copies.

If you only read the data, prefer:

```cpp
for (const auto& x : container)
```

If you need to modify the actual element:

```cpp
for (auto& x : container)
```

If the object is small, such as `int` or `double`, copying is fine:

```cpp
for (auto x : numbers)
```

But if the object is large, such as `Tick`, `Order`, `Trade`, `std::string`, or `std::vector`, you should be careful.

---

## 9. End-of-day checklist

You must remember:

```cpp
auto x = value;          // copy
auto& x = value;         // reference
const auto& x = value;   // read-only reference, avoids copying
```

You should be able to answer:

```text
1. Is `auto` a dynamic type?
2. What is the difference between `auto` and `auto&`?
3. Why is `const auto&` commonly used when iterating through containers?
4. Why is `auto s = "ABC"` not `std::string`?
5. When should you avoid overusing `auto`?
```

---

## 10. Conclusion

`auto` is a small but very important feature in Modern C++.

Understanding `auto` correctly is not just about knowing that the compiler can infer the type. You also need to know:

```text
1. When it copies.
2. When it keeps a reference.
3. When it makes code shorter.
4. When it makes code harder to read.
5. When it affects performance.
```

The most important idea for Day 1:

```text
In range-based for loops:
- `auto` copies.
- `auto&` can modify the original object.
- `const auto&` is read-only and avoids copying.
```
