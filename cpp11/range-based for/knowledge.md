# Modern C++11 - Day 3: Range-Based For

## 1. Goal

After learning range-based for loops, you should understand:

```text
1. Why C++11 introduced range-based for.
2. The minimum syntax.
3. The difference between copy, reference, and const reference.
4. Common mistakes when iterating over containers.
5. How to use range-based for in performance-sensitive code.
```

---

## 2. What Problem Does It Solve?

Before C++11, iterating over containers often required manual indexes or iterators:

```cpp
for (std::vector<int>::iterator it = v.begin(); it != v.end(); ++it)
```

Range-based for makes iteration shorter, cleaner, and less error-prone:

```cpp
for (auto x : v)
```

Main idea:

```text
Iterate directly over elements instead of manually managing indexes or iterators.
```

---

## 3. Minimum Syntax

Copy each element:

```cpp
for (auto x : container)
```

Modify the real element:

```cpp
for (auto& x : container)
```

Read without copying:

```cpp
for (const auto& x : container)
```

Summary:

```text
auto        = copy
auto&       = reference, can modify
const auto& = read-only reference, avoids copying
```

---

## 4. Common Mistakes

### 4.1. Forgetting `&` when modifying elements

```cpp
for (auto x : values) {
    x = 0;
}
```

This only modifies the copy, not the original container.

Use:

```cpp
for (auto& x : values) {
    x = 0;
}
```

---

### 4.2. Copying heavy objects

```cpp
for (auto order : orders)
```

This copies every order.

If you only read the data, prefer:

```cpp
for (const auto& order : orders)
```

---

### 4.3. Modifying a container while iterating

Be careful when adding or removing elements during iteration.

This may invalidate references or iterators, especially with containers like `std::vector`.

---

## 5. When Should You Use It?

Use range-based for when:

```text
1. You want to visit every element.
2. You do not need the index.
3. The iteration order is simple.
4. The code should be clean and readable.
```

Avoid it when:

```text
1. You need the index.
2. You need to erase elements while iterating.
3. You need complex iterator control.
```

---

## 6. Notes for Trading / Performance-Sensitive Code

In trading systems, containers may store many objects:

```text
Order
Trade
Tick
MarketData
Position
```

For large objects, avoid unnecessary copies:

```cpp
for (const auto& order : orders)
```

Use references when updating real objects:

```cpp
for (auto& position : positions)
```

Use copies only for small objects like `int`, `double`, or when you intentionally need a copy.

---

## 7. End-of-Day Checklist

You should remember:

```text
for (auto x : c)        -> copy
for (auto& x : c)       -> modify original
for (const auto& x : c) -> read-only, no copy
```

You should be able to answer:

```text
1. Why is range-based for cleaner than iterator loops?
2. When does `auto` copy?
3. When should you use `auto&`?
4. Why is `const auto&` important for large objects?
5. When should you avoid range-based for?
```

---

## 8. Conclusion

Range-based for is a simple but important C++11 feature.

The key idea:

```text
Use range-based for when you want to iterate over every element clearly.
Choose auto, auto&, or const auto& depending on copy, modification, and performance needs.
```

::: 
