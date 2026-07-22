# Lvalue and Lvalue Reference

## Lvalue

An lvalue identifies an existing object.

```cpp
int price = 100;
price = 101;
```

`price` is an lvalue because it identifies an existing object.

## Lvalue Reference

An lvalue reference is another name for an existing object.

```cpp
int& ref = price;
ref = 102;
```

Changing `ref` changes `price` because both names refer to the same object.

## Function Parameter

```cpp
void update(double& value);
```

A non-const lvalue-reference parameter allows a function to modify the original
object supplied by the caller.

## Const Reference

```cpp
void inspect(const double& value);
```

Use a const lvalue reference to read an object without copying it and without
allowing the function to modify it through that reference.

## Key Rules

- Passing a parameter by value creates a separate parameter object.
- A non-const `T&` refers to the original object and can modify it.
- A `const T&` reads the original object without copying or modifying it through
  that reference.
