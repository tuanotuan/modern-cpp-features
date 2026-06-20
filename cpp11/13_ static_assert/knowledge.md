# Modern C++11 - Day 13: `static_assert`

## 1. Goal

After learning `static_assert`, you should understand:

```text
1. What static_assert does.
2. When static_assert is checked.
3. What kind of condition it requires.
4. How constexpr and static_assert work together.
5. Common mistakes when using static_assert.
```

---

## 2. What Problem Does It Solve?

`static_assert` checks a condition at compile time.

```cpp
constexpr int MaxOrders = 1000;

static_assert(MaxOrders > 0,
              "MaxOrders must be positive");
```

If the condition is true, compilation continues.

If the condition is false, compilation fails and the compiler displays the error message.

Main idea:

```text
Use static_assert to reject invalid compile-time values or assumptions.
```

---

## 3. Minimum Syntax

In C++11:

```cpp
static_assert(condition, "error message");
```

Successful check:

```cpp
static_assert(10 > 5, "10 must be greater than 5");
```

Failed check:

```cpp
static_assert(10 < 5, "10 must be less than 5");
```

The second example does not compile.

---

## 4. Working with `constexpr`

`static_assert` requires a condition that can be evaluated at compile time.

```cpp
constexpr int MaxOrders = 1000;

static_assert(MaxOrders <= 5000,
              "MaxOrders exceeds system capacity");
```

The relationship is:

```text
constexpr     = provides a compile-time value
static_assert = checks a compile-time condition
```

---

## 5. Common Mistakes

### 5.1. Using a runtime value

This is invalid:

```cpp
int n;
std::cin >> n;

static_assert(n > 0, "n must be positive");
```

The compiler cannot know what the user will enter when the program runs.

### 5.2. Reversing the condition

Correct:

```cpp
static_assert(MaxOrders > 0,
              "MaxOrders must be positive");
```

The condition describes what must be true.

### 5.3. Thinking it runs inside the program

`static_assert` is checked while the source code is being compiled.

It does not wait until `main()` runs.

---

## 6. Small Practical Example

```cpp
#include <iostream>

constexpr int MaxOrders = 1000;
constexpr int MaxPrice = 1000000;

static_assert(MaxOrders > 0,
              "MaxOrders must be positive");

static_assert(MaxOrders <= 5000,
              "MaxOrders exceeds system capacity");

static_assert(MaxPrice > 0,
              "MaxPrice must be positive");

int main() {
    std::cout << "Configuration is valid\n";
    std::cout << "Max orders: " << MaxOrders << '\n';

    return 0;
}
```

If `MaxOrders` is changed to `10000`, compilation fails because:

```cpp
static_assert(MaxOrders <= 5000,
              "MaxOrders exceeds system capacity");
```

---

## 7. When Should You Use `static_assert`?

Use it when:

```text
1. A fixed configuration must satisfy a rule.
2. A compile-time limit must stay within a safe range.
3. Invalid code should be rejected before the program runs.
4. You need to document an important compile-time assumption.
```

Do not use it when the condition depends on user input or other runtime data.

---

## 8. End-of-Day Checklist

You should remember:

```text
static_assert checks a condition at compile time.
```

You should be able to answer:

```text
1. When is static_assert checked?
2. What happens when its condition is false?
3. Can it use a value entered by the user?
4. Why does it work well with constexpr?
5. What does its error message describe?
```

---

## 9. Conclusion

`static_assert` prevents invalid compile-time configurations from becoming runnable programs.

The key idea:

```text
If a rule can be checked during compilation, use static_assert to enforce it.
```