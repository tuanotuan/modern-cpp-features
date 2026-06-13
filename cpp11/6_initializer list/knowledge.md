# Modern C++11 - Day 6: Initializer List

## 1. Goal

After learning initializer list, you should understand:

```text
1. Why C++11 introduced uniform initialization.
2. How to initialize variables, structs, and containers with braces.
3. Why brace initialization can be safer than old initialization styles.
4. Common mistakes with initializer lists.
5. How initializer lists improve readability in real-world C++ code.
```

---

## 2. What Problem Does It Solve?

Before C++11, C++ had many different initialization styles:

```cpp
int x = 10;
int y(20);
std::vector<int> v;
v.push_back(1);
v.push_back(2);
```

C++11 introduced brace initialization:

```cpp
int x{10};
std::vector<int> v{1, 2, 3};
```

Main idea:

```text
Use one consistent syntax to initialize objects.
```

---

## 3. Minimum Syntax

Initialize basic values:

```cpp
int x{10};
double price{191.25};
```

Initialize structs:

```cpp
Order order{101, "AAPL", 191.25, 100};
```

Initialize containers:

```cpp
std::vector<int> values{1, 2, 3};
std::vector<std::string> symbols{"AAPL", "MSFT", "NVDA"};
```

Initialize maps:

```cpp
std::unordered_map<std::string, double> prices{
    {"AAPL", 191.25},
    {"MSFT", 420.50}
};
```

---

## 4. Why Brace Initialization Is Useful

Brace initialization is:

```text
1. Shorter.
2. More consistent.
3. Easier to read.
4. Useful for structs and containers.
5. Safer against narrowing conversions.
```

Example:

```cpp
int x{3.14}; // Error: narrowing conversion
```

This prevents accidentally losing data.

---

## 5. Common Mistakes

### 5.1. Narrowing conversion

```cpp
int x{3.14};
```

This is not allowed because `3.14` would lose information when converted to `int`.

---

### 5.2. Confusion with vector size constructor

```cpp
std::vector<int> a(5);   // five zeros
std::vector<int> b{5};   // one element: 5
```

Parentheses and braces can mean different things.

---

### 5.3. Assuming braces always call the constructor you expect

If a class has an initializer-list constructor, braces may prefer it.

Be careful when using braces with classes that have multiple constructors.

---

## 6. When Should You Use It?

Use initializer lists when:

```text
1. Initializing structs.
2. Initializing containers with known values.
3. Creating small test data.
4. Avoiding narrowing conversions.
5. Making initialization clear and compact.
```

---

## 7. Notes for Trading / Performance-Sensitive Code

Trading code often creates small domain objects such as:

```text
Order
Tick
Trade
Position
MarketData
```

Initializer lists make test data concise and readable:

```cpp
Order order{101, "AAPL", 191.25, 100};
```

They are especially useful for quick simulations, unit tests, and sample market data.

---

## 8. End-of-Day Checklist

You should remember:

```text
T x{value};
std::vector<T> v{a, b, c};
Struct obj{field1, field2, field3};
```

You should be able to answer:

```text
1. What problem does initializer list solve?
2. Why is brace initialization consistent?
3. What is narrowing conversion?
4. What is the difference between vector<int> a(5) and vector<int> b{5}?
5. Why is it useful for trading-style test data?
```

---

## 9. Conclusion

Initializer list is a practical C++11 feature.

The key idea:

```text
Use braces to initialize objects clearly and consistently.
Be careful with narrowing conversions and constructor selection.
```

::: 
