# Modern C++11 Prep - Old-Style `enum`

## 1. Goal

Before learning `enum class`, you should understand old-style `enum`.

After this lesson, you should understand:

```text
1. What an enum is.
2. Why enum is better than raw integers.
3. The minimum syntax.
4. Common problems with old-style enum.
5. Why C++11 introduced enum class.
```

---

## 2. What Problem Does `enum` Solve?

An enum represents a fixed set of named values.

Instead of writing unclear integers:

```cpp
int side = 0;   // What does 0 mean?
int status = 2; // What does 2 mean?
```

Use named values:

```cpp
enum Side {
    Buy,
    Sell
};
```

Main idea:

```text
Use enum when a variable can only have a small fixed set of valid values.
```

Examples:

```text
Side: Buy / Sell
OrderStatus: New / Filled / Cancelled
OrderType: Market / Limit
ConnectionState: Connected / Disconnected
```

---

## 3. Minimum Syntax

Define an enum:

```cpp
enum Side {
    Buy,
    Sell
};
```

Create a variable:

```cpp
Side side = Buy;
```

Compare enum values:

```cpp
if (side == Buy) {
    // buy order
}
```

Use enum in a switch:

```cpp
switch (side) {
    case Buy:
        break;
    case Sell:
        break;
}
```

---

## 4. What Values Do Enum Members Have?

By default, enum values start from 0.

```cpp
enum Side {
    Buy,  // 0
    Sell  // 1
};
```

You can also assign explicit values:

```cpp
enum OrderStatus {
    New = 1,
    Filled = 2,
    Cancelled = 3,
    Rejected = 4
};
```

---

## 5. Common Mistakes

### 5.1. Enum names leak into the surrounding scope

```cpp
enum Side {
    Buy,
    Sell
};

enum Action {
    Buy,
    Cancel
};
```

This causes a name conflict because both enums define `Buy` in the same scope.

---

### 5.2. Old-style enum can convert to int

```cpp
Side side = Buy;
int x = side;
```

This compiles because old-style enum can implicitly convert to integer.

This can be dangerous because it weakens type safety.

---

### 5.3. Raw integers can still be confusing

Avoid:

```cpp
int side = 0;
```

Prefer:

```cpp
Side side = Buy;
```

Named values are much easier to understand than magic numbers.

---

## 6. Why This Matters Before `enum class`

Old-style enum is useful, but it has weaknesses:

```text
1. Names are not scoped.
2. Values can convert to int.
3. Different enums can conflict with each other.
4. Type safety is weaker.
```

C++11 introduced `enum class` to fix these problems.

---

## 7. Notes for Trading Code

Trading systems often use fixed sets of domain values:

```text
Side
OrderType
OrderStatus
TimeInForce
Exchange
MessageType
```

Using enums makes code clearer than raw integers.

Example idea:

```text
Buy is clearer than 0.
Sell is clearer than 1.
Filled is clearer than 2.
```

But old-style enum has type-safety problems, so modern C++ usually prefers `enum class`.

---

## 8. End-of-Day Checklist

You should be able to answer:

```text
1. What is an enum?
2. Why is enum better than raw integers?
3. What value does the first enum member have by default?
4. Why can old-style enum cause name conflicts?
5. Why did C++11 introduce enum class?
```

---

## 9. Conclusion

Old-style enum is used to represent a fixed set of named values.

The key idea:

```text
enum improves readability compared to raw integers,
but old-style enum has scope and type-safety problems.
```

This is why C++11 introduced `enum class`.
::: 
