# Modern C++11 - Day 15: Deleted Functions

## 1. Definition

A deleted function is a function that is explicitly disabled by the programmer.

The function is declared, but the compiler is told that it must not be used.

---

## 2. Why It Was Introduced

Before C++11, programmers often used private declarations to prevent certain operations such as copying.

That technique was indirect and could produce unclear error messages.

C++11 introduced deleted functions to express the intention directly.

The programmer can clearly state that a function exists as part of the interface, but using it is forbidden.

---

## 3. Main Idea

A deleted function means:

> This operation is intentionally not allowed.

It is commonly used to prevent copying, assignment, or unwanted overloads.

---

## 4. Common Use Cases

Deleted functions are commonly used to:

- Disable copying
- Disable assignment
- Prevent accidental type conversions
- Block unsafe overloads
- Make ownership rules explicit

---

## 5. Deleted Function vs Missing Function

A missing function simply does not exist.

A deleted function exists in the interface, but any attempt to use it causes a compile-time error.

This makes the programmer's intention clearer and gives better diagnostics.

---

## 6. Deleted Function vs Defaulted Function

A defaulted function asks the compiler to generate its normal implementation.

A deleted function tells the compiler that the function must not be used.

They are opposite tools.

Defaulted functions enable compiler-generated behavior.

Deleted functions disable specific behavior.

---

## 7. Compile-Time Protection

Deleted functions create errors at compile time, before the program runs.

This is useful because unsafe or unwanted operations are rejected early.

The program cannot accidentally perform the disabled operation at runtime.

---

## 8. Common Mistakes

### Mistake 1: Thinking It Deletes an Object

A deleted function does not delete memory or destroy an object.

It only disables a function from being called.

### Mistake 2: Confusing It with Defaulted Functions

Defaulted functions request compiler-generated behavior.

Deleted functions forbid usage.

### Mistake 3: Deleting a Function That Is Actually Needed

If normal code needs copying, assignment, or another operation, deleting it will make the type harder to use.

### Mistake 4: Assuming Runtime Behavior

Deleted functions are checked by the compiler.

They are not runtime checks.

---

## 9. When to Use It

Use deleted functions when:

- An operation would be unsafe.
- An operation does not make sense for the type.
- A class owns a resource and should not be copied.
- You want compile-time protection against accidental usage.
- You want the interface to clearly communicate forbidden behavior.

---

## 10. Benefits

- Makes forbidden operations explicit.
- Produces compile-time errors.
- Improves class interface clarity.
- Helps enforce ownership rules.
- Prevents accidental copying or conversion.

---

## 11. End-of-Day Checklist

You should be able to explain:

1. What a deleted function means.
2. Why C++11 introduced deleted functions.
3. How deleted functions differ from defaulted functions.
4. Why deleted functions are checked at compile time.
5. Why deleted functions are useful for resource-owning classes.
6. Why deleting a function is not the same as deleting memory.

---

## 12. Conclusion

Deleted functions explicitly disable operations that should not be used.

They are a compile-time safety tool for making class interfaces clearer and preventing invalid behavior.