# C++98 Reference

## 1. Goal

Learn how references provide an alternative way to access an existing object.

After this lesson, you should understand:

    1. What a reference is.
    2. Why references exist.
    3. How references differ from pointers.
    4. How pass-by-reference works.
    5. Common reference mistakes.

* * *

## 2. What Problem Does This Solve?

Copying objects can be expensive.

Sometimes a function must work directly with the original object.

A reference provides another name for an existing object.

Main idea:

    One object
    Multiple names

* * *

## 3. Minimum Syntax

Create a reference:

    type& ref = object;

Example:

    int& ref = x;

Use it exactly like the original object.

No dereferencing syntax is required.

* * *

## 4. Memory Model

Conceptually:

    object ---> memory

A reference refers directly to that object.

Important:

    A reference is not a new object.
    A reference does not own memory.
    A reference is simply another name.

* * *

## 5. Reference vs Pointer

Reference:

    Must bind during initialization.
    Cannot be reseated.
    Normally cannot be null.
    Access uses normal object syntax.

Pointer:

    Can be null.
    Can point elsewhere later.
    Requires dereferencing.
    Stores an address explicitly.

* * *

## 6. Common Mistakes

### 6.1 Thinking a Reference Creates a Copy

A reference aliases an existing object.

Changes affect the original object.

* * *

### 6.2 Forgetting Initialization

References must be initialized immediately.

* * *

### 6.3 Expecting Rebinding

Once bound, a reference remains attached to the same object.

* * *

### 6.4 Returning a Reference to a Local Object

A local object dies when the function returns.

Returning a reference to it creates a dangling reference.

* * *

## 7. Notes for Trading Code

References are commonly used for:

    order updates
    market data processing
    risk calculations
    order book operations

Benefits:

    no copy cost
    simpler syntax
    safer than raw pointers

* * *

## 8. End-of-Day Checklist

You should be able to answer:

    1. What is a reference?
    2. Why use pass-by-reference?
    3. How is a reference different from a pointer?
    4. Can a reference be null?
    5. Can a reference be rebound?
    6. What is a dangling reference?

* * *

## 9. Conclusion

A reference is an alias for an existing object.

The key idea:

    Reference = another name for an object.

References are one of the most important foundations for modern C++ and are heavily used in high-performance systems.