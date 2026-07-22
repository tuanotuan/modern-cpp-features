# Rvalue and Rvalue Reference

## Rvalue

An rvalue usually represents a temporary value.

```cpp
100
x + 1
std::string("EURUSD")
```

## Rvalue Reference

An rvalue reference binds to an rvalue.

```cpp
std::string&& ref = std::string("EURUSD");
```

## Function Parameter

```cpp
void process(std::string&& value);
```

This parameter accepts temporary `std::string` values.

```cpp
process(std::string("EURUSD"));
```

A named variable cannot be passed directly because it is an lvalue.

## Named Rvalue References

A variable may have type T&&, but using its name produces an lvalue expression.

```cpp
int&& ref = 100;
```

`100` is an rvalue, while `ref` is an lvalue expression.

## Key Rules

- Literals are usually rvalues.
- Temporary objects are rvalues.
- Arithmetic results are usually rvalues.
- Named variables are lvalues.
- `T&&` binds to rvalues when `T` is a concrete, non-deduced type.
