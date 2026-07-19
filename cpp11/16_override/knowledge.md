# Day 16 — `override`

## 1. What Problem Does It Solve?

`override` helps the compiler check that a function in a child class really replaces a virtual function from the parent class.

It catches mistakes such as:

- Wrong function name
- Wrong parameter type
- Missing `const`

---

## 2. Minimal Syntax

```cpp
class Animal {
public:
    virtual void talk();
};

class Cat : public Animal {
public:
    void talk() override;
};
```

Remember:

```text
Parent class: virtual
Child class: override
```

---

## 3. Simple Example

```cpp
class Animal {
public:
    virtual void talk() {
        cout << "Animal sound";
    }
};

class Cat : public Animal {
public:
    void talk() override {
        cout << "Meow";
    }
};
```

When an `Animal` pointer points to a `Cat` object:

```cpp
Cat cat;
Animal* p = &cat;

p->talk();
```

Result:

```text
Meow
```

---

## 4. Why Is `override` Useful?

Suppose the programmer writes the wrong function name:

```cpp
void taak();
```

`taak()` does not replace `talk()`.

With:

```cpp
void taak() override;
```

the compiler reports an error immediately.

---

## 5. Common Mistake: Missing `const`

These two functions are different:

```cpp
void talk() const;
void talk();
```

Correct code:

```cpp
class Animal {
public:
    virtual void talk() const;
};

class Cat : public Animal {
public:
    void talk() const override;
};
```

---

## 6. Important Rules

- The parent function must be `virtual`.
- Write `override` in the child class.
- The function names must match.
- The parameters must match.
- `const` must also match.
- Use `override` whenever a child class replaces a virtual function.

---

## 7. Easy Mental Model

```text
virtual  = allows replacing
override = checks replacing
```

`override` means:

> Compiler, check that this child function really replaces a parent virtual function.