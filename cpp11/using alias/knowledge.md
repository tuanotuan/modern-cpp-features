# Modern C++11 - Day 4: `using` Alias

## 1. Goal

After learning `using` alias, you should understand:

```text
1. Why C++11 introduced `using` alias.
2. How it improves readability compared to long type names.
3. The difference between `using` and `typedef`.
4. Common mistakes when creating aliases.
5. How aliases help in real-world C++ code.
```

---

## 2. What Problem Does It Solve?

In C++, type names can become long and hard to read, especially with STL containers.

Example:

```cpp
std::unordered_map<std::string, std::vector<double>>
```

A `using` alias gives a readable name to a type:

```cpp
using PriceHistory = std::unordered_map<std::string, std::vector<double>>;
```

Main idea:

```text
Give a complex type a clear, meaningful name.
```

This makes code shorter, easier to read, and easier to maintain.

---

## 3. Minimum Syntax

Basic alias:

```cpp
using NewName = ExistingType;
```

Examples:

```cpp
using Price = double;
using Quantity = int;
using Symbol = std::string;
```

Alias for STL containers:

```cpp
using PriceHistory = std::unordered_map<std::string, std::vector<double>>;
```

Alias for function pointers:

```cpp
using Handler = void(*)(int);
```

Alias template:

```cpp
template <typename T>
using Vec = std::vector<T>;
```

---

## 4. `using` vs `typedef`

Old style:

```cpp
typedef long long ll;
```

Modern C++ style:

```cpp
using ll = long long;
```

For simple types, both work.

But `using` is usually clearer, especially for complex types and templates.

Alias templates are much cleaner with `using`:

```cpp
template <typename T>
using Vec = std::vector<T>;
```

---

## 5. Common Mistakes

### 5.1. Hiding important domain meaning

```cpp
using Price = double;
using Quantity = double;
```

Both are `double`, so the compiler cannot prevent mixing them.

Aliases improve readability, but they do not create new strong types.

---

### 5.2. Overusing aliases

Too many aliases can make code harder to understand.

Use aliases only when they make the code clearer.

---

### 5.3. Confusing alias with a new type

```text
using Price = double;
```

This does not create a new independent type.

It is just another name for `double`.

---

## 6. When Should You Use `using` Alias?

Use `using` when:

```text
1. A type name is too long.
2. The alias improves domain readability.
3. You want to simplify STL container types.
4. You want cleaner function pointer declarations.
5. You want alias templates.
```

Avoid it when:

```text
1. The original type is already simple.
2. The alias hides too much information.
3. Too many aliases make the code harder to navigate.
```

---

## 7. Notes for Trading / Performance-Sensitive Code

Trading code often has domain concepts such as:

```text
Price
Quantity
Symbol
OrderId
Timestamp
OrderBook
```

Aliases can make code more readable:

```cpp
using Price = double;
using Quantity = int;
using Symbol = std::string;
```

However, remember:

```text
A type alias is not a new strong type.
It only gives another name to an existing type.
```

For stronger type safety, you need wrapper structs or strong typedef patterns.

---

## 8. End-of-Day Checklist

You should remember:

```text
using NewName = ExistingType;
```

You should be able to answer:

```text
1. Why is `using` useful?
2. How is it different from `typedef`?
3. Does `using Price = double` create a new type?
4. When can aliases make code harder to read?
5. Why are alias templates useful?
```

---

## 9. Conclusion

`using` alias is a small but practical C++11 feature.

The key idea:

```text
Use `using` to give long or domain-specific types clearer names.
Do not overuse it, and remember that an alias is not a new type.
```

::: 
