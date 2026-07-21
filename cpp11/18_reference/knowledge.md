# Day 18 — Basic References (`T&`) in C++11

## 1. Purpose

A reference is an **alias for an existing object**.

Use `T&` when a function or variable should work with the original object instead of making a copy.

Typical reasons:

- Avoid copying large objects.
- Modify the caller's object in place.
- Return access to an object stored elsewhere.
- Express that an argument must exist and cannot be null.

---

## 2. Minimal Syntax

```cpp
T value{};
T& ref = value;

void update(T& x);
const T& view(const T& x);
```

Key rule: a non-const lvalue reference must bind to an existing non-const lvalue.

---

## 3. Core Semantics

- `ref` is not a separate object.
- Reading through `ref` reads the original object.
- Writing through `ref` changes the original object.
- A reference must be initialized immediately.
- A reference cannot later be reseated to another object.
- `const T&` allows reading but prevents modification through that reference.

---

## 4. Common Failure Modes

### Dangling Reference

Returning or storing a reference to an object whose lifetime has ended causes undefined behavior.

### Accidental Mutation

Passing `T&` grants write access. Use `const T&` when mutation is not intended.

### Hidden Aliasing

Two names may refer to the same object. A change through one name is visible through the other.

### Container Invalidation

References to container elements may become invalid after operations such as reallocation, erase, or rehash. Check the container's invalidation rules.

### Temporary Binding

A non-const `T&` cannot bind to a temporary. `const T&` can bind to a temporary and extend its lifetime in limited contexts.

---

## 5. Trading-System Perspective

References are common in latency-sensitive code because they make ownership and copying decisions explicit.

Typical uses include:

- Updating a position or order in place.
- Passing market-data snapshots without copying.
- Accessing objects stored in books, caches, or risk tables.
- Separating mutable APIs (`T&`) from read-only APIs (`const T&`).

References do not automatically make code faster or safe. Correct lifetime management and container stability remain essential.

---

## 6. Practical Guideline

| Intent | Preferred Form |
|---|---|
| Read a large object | `const T&` |
| Modify caller-owned object | `T&` |
| Optional object | pointer or optional wrapper |
| Transfer ownership | smart pointer / move semantics |
| Small cheap value | pass by value |

---

## 7. Mental Model

> `T&` means: “use this existing object directly; do not copy it.”

Before using a reference, verify:

1. The referenced object outlives the reference.
2. Mutation is intentional.
3. No container operation invalidates the reference.
4. Aliasing is acceptable and understood.