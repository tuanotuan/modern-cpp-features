# Day 17 — `final` in C++11

## 1. Core Idea

The `final` specifier prevents further inheritance or virtual-function overriding.

It can be applied to:

- A virtual function
- An entire class

---

## 2. Function-Level `final`

A virtual function marked `final` cannot be overridden by later derived classes.

```cpp
class Base
{
public:
    virtual void run();
};

class Derived : public Base
{
public:
    void run() override final;
};
```

`Derived::run()` overrides `Base::run()`, but no class derived from `Derived` may override it again.

## 3. Class-Level `final`

A class marked `final` cannot be used as a base class.

```cpp
class Connection final
{
};
```

Any attempt to inherit from `Connection` causes a compilation error.

## 4. Relationship with `virtual` and `override`

`virtual` means:

Derived classes may replace this behavior.

`override` means:

Verify that this function correctly replaces a base virtual function.

`final` means:

Do not allow any further replacement.

A common modern C++ declaration is:

```cpp
void run() override final;
```

## 5. Common Errors

### Overriding a Final Function

A derived class cannot override a function already marked `final`.

### Inheriting from a Final Class

A class marked `final` cannot have derived classes.

### Using `final` on a Non-Virtual Function

Function-level `final` is only valid for virtual functions.

### Applying `final` Too Early

Excessive use of `final` may prevent legitimate extension of a class hierarchy.

## 6. Practical Uses

`final` is useful when:

- A validated algorithm must not be changed
- A security or risk rule must remain fixed
- A class is not designed for inheritance
- Further overriding would violate an invariant
- An implementation represents the final layer of a hierarchy

## 7. Recommended Style

Use:

```cpp
void function() override final;
```

when a derived function both overrides a base virtual function and must not be overridden again.

Use:

```cpp
class ClassName final;
```

when the class is intentionally not designed as a base class.

Do not add `final` everywhere. Use it only when the design intentionally forbids further extension.

## 8. Mental Model

```text
virtual  -> extension is allowed
override -> extension is checked
final    -> extension stops here
```

## 9. Key Takeaway

`final` protects class hierarchies from unintended extension.

It converts an architectural restriction into a compile-time rule.
