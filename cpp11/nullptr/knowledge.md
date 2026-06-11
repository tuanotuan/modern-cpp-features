# Modern C++11 - Day 2: `nullptr`

## 1. Goal

After learning `nullptr`, you should understand:

```text
1. Why C++11 introduced `nullptr`.
2. How to use `nullptr` correctly.
3. Why `nullptr` is safer than `NULL` or `0`.
4. Common mistakes related to null pointers.
5. How `nullptr` improves readability in real-world C++ code.
```

---

## 2. What Problem Does `nullptr` Solve?

Before C++11, programmers often used `NULL` or `0` to represent a null pointer:

```cpp
int* p = NULL;
int* q = 0;
```

The problem is that `NULL` is usually just an integer constant, often defined as `0`.

This can cause ambiguity, especially with function overloading.

`nullptr` solves this problem by introducing a real null pointer value with its own type:

```cpp
std::nullptr_t
```

Main idea:

```text
nullptr clearly means: this is a null pointer, not an integer.
```

---

## 3. Minimum Syntax

Initialize a pointer with no target:

```cpp
int* p = nullptr;
```

Check whether a pointer is null:

```cpp
if (p == nullptr) {
    // p does not point to anything
}
```

Reset a pointer:

```cpp
p = nullptr;
```

Pass a null pointer to a function:

```cpp
processOrder(nullptr);
```

---

## 4. Why `nullptr` Is Better Than `NULL`

### 4.1. `NULL` can behave like an integer

```cpp
f(NULL);
```

If there are overloaded functions, this may call the wrong overload.

Example idea:

```text
f(int)
f(int*)

NULL may match f(int), because NULL is often just 0.
```

### 4.2. `nullptr` is type-safe

```cpp
f(nullptr);
```

This clearly means the pointer overload should be used.

Summary:

```text
NULL    = old style, may behave like 0
0       = integer literal
nullptr = modern, type-safe null pointer
```

---

## 5. Common Mistakes

### 5.1. Dereferencing `nullptr`

```cpp
int* p = nullptr;
*p = 10;
```

This is dangerous because `p` does not point to valid memory.

Rule:

```text
Always check a pointer before dereferencing it.
```

Correct idea:

```cpp
if (p != nullptr) {
    *p = 10;
}
```

---

### 5.2. Using `NULL` in modern C++

Old style:

```cpp
Order* order = NULL;
```

Modern C++ style:

```cpp
Order* order = nullptr;
```

Use `nullptr` whenever you mean "no pointer".

---

### 5.3. Thinking `nullptr` is the same as `0`

`nullptr` can convert to pointer types, but it is not an integer.

```cpp
int* p = nullptr; // OK
int x = nullptr;  // Error
```

---

### 5.4. Forgetting to check for null

A function may return `nullptr` when it cannot find a valid object.

```cpp
Order* order = findOrder(id);
```

Before using it, check:

```cpp
if (order != nullptr) {
    // safe to use order
}
```

Otherwise, accessing `order->price` may crash the program.

---

## 6. When Should You Use `nullptr`?

Use `nullptr` when:

```text
1. Initializing a pointer with no target.
2. Resetting a pointer.
3. Checking whether a pointer is null.
4. Passing a null pointer to a function.
5. Writing modern C++ instead of old C-style code.
```

---

## 7. Notes for Trading / Performance-Sensitive Code

In trading systems, pointers may refer to objects such as:

```text
Order
Trade
MarketData
OrderBook
Connection
```

A null pointer may mean:

```text
1. No active order.
2. No valid market data.
3. No current connection.
4. No available order book.
```

Using `nullptr` makes the intention clear:

```text
There is no valid object here.
```

This is safer and more readable than using `NULL` or `0`.

---

## 8. End-of-Day Checklist

You should remember:

```text
nullptr = a real null pointer value
NULL    = usually just 0
0       = an integer literal
```

You should be able to answer:

```text
1. Why is `nullptr` safer than `NULL`?
2. What type does `nullptr` have?
3. What happens if you dereference `nullptr`?
4. Why can `NULL` cause overload ambiguity?
5. When should you use `nullptr` in modern C++?
```

---

## 9. Conclusion

`nullptr` is a small but important C++11 feature.

The key idea:

```text
Use nullptr whenever you mean "no pointer".
Do not use NULL or 0 in modern C++ pointer code.
```

::: 
