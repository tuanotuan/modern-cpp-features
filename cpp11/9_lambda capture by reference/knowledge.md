# Modern C++11 - Day 9: Lambda Capture by Reference

## 1. Goal

After learning lambda capture by reference, you should understand:

```text
1. What capture by reference means.
2. How it differs from capture by value.
3. When to use [&x] and [&].
4. Common mistakes with dangling references.
5. How reference capture is used in real-world C++ code.
```

---

## 2. What Problem Does It Solve?

Capture by value gives the lambda a copy of an outside variable.

Capture by reference lets the lambda use the original variable directly.

```cpp
int total = 0;

auto add = [&total](int x) {
    total += x;
};
```

Main idea:

```text
Capture by reference allows a lambda to read or modify the original outside variable.
```

---

## 3. Minimum Syntax

Capture one variable by reference:

```cpp
[&x]() {
    x += 1;
};
```

Capture multiple variables by reference:

```cpp
[&a, &b]() {
    a += 1;
    b += 1;
};
```

Capture all used outside variables by reference:

```cpp
[&]() {
    total += 1;
};
```

Basic meaning:

```text
[]       = capture nothing
[x]      = capture x by value
[&x]     = capture x by reference
[=]      = capture all used outside variables by value
[&]      = capture all used outside variables by reference
```

---

## 4. Capture by Value vs Capture by Reference

Capture by value:

```cpp
int threshold = 1000;

auto f = [threshold]() {
    return threshold;
};

threshold = 2000;
```

The lambda still sees `1000`.

Capture by reference:

```cpp
int threshold = 1000;

auto f = [&threshold]() {
    return threshold;
};

threshold = 2000;
```

The lambda sees `2000`.

Summary:

```text
Capture by value     = snapshot copy
Capture by reference = access original variable
```

---

## 5. Common Mistakes

### 5.1. Dangling reference

Do not return a lambda that captures a local variable by reference.

```cpp
auto makeLambda() {
    int x = 10;
    return [&x]() {
        return x;
    };
}
```

After the function ends, `x` no longer exists. The lambda holds a broken reference.

---

### 5.2. Accidental modification

```cpp
int threshold = 1000;

auto f = [&threshold]() {
    threshold = 2000;
};
```

Because the lambda captures by reference, it modifies the original variable.

---

### 5.3. Overusing `[&]`

```cpp
auto f = [&]() {
    // uses many outside variables
};
```

This can make it unclear which variables the lambda depends on or modifies.

Prefer explicit captures when clarity matters:

```cpp
auto f = [&total, threshold]() {
    // total by reference, threshold by value
};
```

---

## 6. When Should You Use Capture by Reference?

Use capture by reference when:

```text
1. You need to modify an outside variable.
2. You want the lambda to see updated values.
3. You want to avoid copying a large object.
4. The lambda will not outlive the referenced variables.
```

Avoid it when:

```text
1. The lambda may outlive the referenced variables.
2. You want a stable snapshot.
3. Accidental modification would be dangerous.
```

---

## 7. Notes for Trading / Performance-Sensitive Code

Trading code may use reference capture to accumulate results:

```text
Total volume
Total notional
Risk counters
Statistics
```

Example idea:

```cpp
double totalNotional = 0.0;

auto addNotional = [&totalNotional](const Trade& trade) {
    totalNotional += trade.price * trade.quantity;
};
```

This modifies the original `totalNotional`.

Be careful with lambdas stored for later execution, callbacks, or threads.

---

## 8. End-of-Day Checklist

You should remember:

```text
[&x] = capture x by reference
[&]  = capture all used outside variables by reference
```

You should be able to answer:

```text
1. What is the difference between [x] and [&x]?
2. When does capture by reference see updated values?
3. Why can dangling references be dangerous?
4. When should you avoid [&]?
5. Why is reference capture useful for accumulation?
```

---

## 9. Conclusion

Capture by reference lets a lambda access the original outside variables.

The key idea:

```text
Use capture by reference when you need shared access or modification.
Be careful with lifetime and accidental mutation.
```

::: 
