# Modern C++11 - Day 8: Lambda Capture by Value

## 1. Goal

After learning lambda capture by value, you should understand:

```text
1. Why lambdas need captures.
2. What capture by value means.
3. The difference between [] and [x].
4. Common mistakes when capturing by value.
5. How capture by value is useful in real-world C++ code.
```

---

## 2. What Problem Does It Solve?

A basic lambda with `[]` cannot use local variables outside the lambda.

```cpp
int threshold = 1000;

auto isLarge = [](int quantity) {
    return quantity > threshold; // Error
};
```

Capture by value allows the lambda to copy outside variables into itself.

```cpp
int threshold = 1000;

auto isLarge = [threshold](int quantity) {
    return quantity > threshold;
};
```

Main idea:

```text
Capture by value gives the lambda its own copy of outside variables.
```

---

## 3. Minimum Syntax

Capture one variable by value:

```cpp
[x](int value) {
    return value > x;
};
```

Capture multiple variables by value:

```cpp
[a, b](int x) {
    return x > a && x < b;
};
```

Capture all used outside variables by value:

```cpp
[=](int x) {
    return x > threshold;
};
```

Basic meaning:

```text
[]          = capture nothing
[x]         = copy x into the lambda
[a, b]      = copy a and b into the lambda
[=]         = copy all used outside variables
```

---

## 4. Important Behavior

Capture by value copies the variable at the moment the lambda is created.

```cpp
int threshold = 1000;

auto isLarge = [threshold](int quantity) {
    return quantity > threshold;
};

threshold = 2000;
```

The lambda still uses the old copied value: `1000`.

Key idea:

```text
Changing the original variable later does not change the lambda's copied value.
```

---

## 5. Common Mistakes

### 5.1. Forgetting to capture

```cpp
int threshold = 1000;

auto isLarge = [](int quantity) {
    return quantity > threshold;
};
```

This is wrong because `threshold` is outside the lambda and was not captured.

---

### 5.2. Expecting captured values to update automatically

```cpp
int threshold = 1000;

auto isLarge = [threshold](int quantity) {
    return quantity > threshold;
};

threshold = 2000;
```

The lambda still uses the copied value `1000`.

---

### 5.3. Capturing large objects by value

```cpp
[orders]() {
    // copies the whole orders container
};
```

This may be expensive if `orders` is large.

For large objects, be careful. Capture by value is safe, but it can cost memory and time.

---

## 6. When Should You Use Capture by Value?

Use capture by value when:

```text
1. You need outside variables inside a lambda.
2. The lambda should keep a stable snapshot of those variables.
3. The captured variables are small.
4. You want safer code that does not depend on later changes.
```

Avoid it when:

```text
1. The captured object is very large.
2. You need the lambda to see updated values.
3. You need to modify the original variable.
```

---

## 7. Notes for Trading / Performance-Sensitive Code

Trading code often uses thresholds:

```text
Large order threshold
Minimum price
Maximum risk limit
Target symbol
```

Capture by value is useful when the lambda should use a stable rule:

```cpp
int threshold = 1000;

auto isLargeOrder = [threshold](const Order& order) {
    return order.quantity > threshold;
};
```

This means the lambda keeps the threshold value that existed when it was created.

---

## 8. End-of-Day Checklist

You should remember:

```text
[]      = capture nothing
[x]     = capture x by value
[a, b]  = capture a and b by value
[=]     = capture all used outside variables by value
```

You should be able to answer:

```text
1. Why does [] not allow using outside variables?
2. What does [threshold] mean?
3. When is the captured value copied?
4. Does changing the original variable update the lambda?
5. Why can capturing large objects by value be expensive?
```

---

## 9. Conclusion

Capture by value lets a lambda use outside variables by copying them.

The key idea:

```text
Capture by value gives the lambda a snapshot of outside variables.
It is safe and clear, but can be expensive for large objects.
```

::: 
