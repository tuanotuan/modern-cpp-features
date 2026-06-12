# Modern C++11 - Day 5: `enum class`

## 1. Goal

After learning `enum class`, you should understand:

```text
1. Why C++11 introduced `enum class`.
2. How it is safer than old-style `enum`.
3. The minimum syntax.
4. Common mistakes when using scoped enums.
5. How `enum class` improves domain modeling in real-world C++ code.
```

---

## 2. What Problem Does It Solve?

Old-style `enum` has two major problems:

```text
1. Enum names leak into the surrounding scope.
2. Enum values can implicitly convert to integers.
```

Example with old-style enum:

```cpp
enum Side { Buy, Sell };
```

The names `Buy` and `Sell` are placed directly into the surrounding scope.

C++11 introduced `enum class` to make enums safer and clearer.

Main idea:

```text
enum class creates scoped and strongly typed enum values.
```

---

## 3. Minimum Syntax

Basic syntax:

```cpp
enum class Side {
    Buy,
    Sell
};
```

Use enum values with the enum name:

```cpp
Side side = Side::Buy;
```

Compare values:

```cpp
if (side == Side::Buy) {
    // buy side
}
```

Specify the underlying type:

```cpp
enum class Side : std::uint8_t {
    Buy,
    Sell
};
```

---

## 4. Why `enum class` Is Better Than Old `enum`

### Old-style enum

```cpp
enum Side { Buy, Sell };
```

Problems:

```text
Buy and Sell leak into the outer scope.
They can implicitly convert to int.
```

### Modern C++ enum class

```cpp
enum class Side { Buy, Sell };
```

Benefits:

```text
Values are scoped: Side::Buy, Side::Sell.
No implicit conversion to int.
Safer and more readable.
```

---

## 5. Common Mistakes

### 5.1. Forgetting the scope

Wrong:

```cpp
Side side = Buy;
```

Correct:

```cpp
Side side = Side::Buy;
```

---

### 5.2. Expecting implicit conversion to int

Wrong:

```cpp
int x = Side::Buy;
```

Correct if conversion is really needed:

```cpp
int x = static_cast<int>(Side::Buy);
```

---

### 5.3. Overusing raw integers instead of domain enums

Avoid:

```cpp
int side = 1;
```

Prefer:

```cpp
Side side = Side::Buy;
```

This makes code safer and easier to understand.

---

## 6. When Should You Use `enum class`?

Use `enum class` when a variable can only have a small fixed set of valid states.

Examples:

```text
Order side: Buy / Sell
Order status: New / Filled / Cancelled
Market data type: Trade / Quote
Connection state: Connected / Disconnected
```

Avoid raw integers or strings when the valid values are fixed and known.

---

## 7. Notes for Trading / Performance-Sensitive Code

Trading code often has domain states:

```text
Side
OrderType
OrderStatus
TimeInForce
Exchange
MessageType
```

`enum class` makes these states explicit and type-safe.

Example idea:

```text
Side::Buy is clearer and safer than int side = 1.
OrderStatus::Filled is clearer than string status = "FILLED".
```

It also helps avoid passing the wrong kind of value to a function.

---

## 8. End-of-Day Checklist

You should remember:

```text
enum class = scoped enum + strong typing
```

You should be able to answer:

```text
1. Why is `enum class` safer than old `enum`?
2. Why do we write `Side::Buy` instead of `Buy`?
3. Can `enum class` convert to int automatically?
4. When should you use `static_cast<int>`?
5. Why is `enum class` useful in trading systems?
```

---

## 9. Conclusion

`enum class` is a safer replacement for old-style enums.

The key idea:

```text
Use enum class to represent a fixed set of domain states clearly and safely.
Prefer Side::Buy over raw integers or unscoped enum values.
```

::: 
