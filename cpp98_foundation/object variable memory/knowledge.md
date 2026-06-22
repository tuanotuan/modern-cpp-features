# C++98 Object / Variable / Memory

## 1. Goal

Before learning modern C++, you must understand the basic relationship between objects, variables, and memory.

After this lesson, you should understand:

    1. What a variable is.
    2. What an object is.
    3. How variables relate to memory.
    4. Why initialization matters.
    5. Common mistakes with object lifetime and copying.

* * *

## 2. What Problem Does This Solve?

C++ programs work with data stored in memory.

A variable gives a name to a value or object so the program can access it.

Main idea:

    A variable is a name.
    An object is the actual entity stored in memory.
    Memory is where objects live.

Example concepts:

    price
    quantity
    side
    order id
    timestamp

These are all represented by objects in memory and accessed through variables.

* * *

## 3. Minimum Syntax

Declare and initialize a variable:

    type name = value;

Examples:

    int price = 100;
    double size = 10.5;
    char side = 'B';

Declare first, assign later:

    int quantity;
    quantity = 50;

Main idea:

    Always prefer initialization when creating a variable.

* * *

## 4. Object vs Variable

A variable is the name used in source code.

An object is the actual typed storage in memory.

Key idea:

    variable name -> refers to -> object in memory

For simple local variables, the distinction is often hidden.

But understanding it becomes important when learning:

    references
    pointers
    object lifetime
    copying
    constructors
    destructors
    move semantics

* * *

## 5. Common Mistakes

### 5.1. Using an uninitialized variable

An uninitialized local variable may contain an unpredictable value.

This is dangerous because the program may appear to work sometimes and fail later.

Prefer:

    Initialize variables immediately.

* * *

### 5.2. Confusing copy with sharing

When one simple variable is assigned to another, the value is copied.

Changing the new variable does not change the old one.

Main idea:

    copy means independent value
    sharing requires references or pointers

* * *

### 5.3. Using an object after its lifetime ends

A local object only lives inside its block.

After leaving the block, the object no longer exists.

This becomes very important when learning pointers and references.

* * *

## 6. Notes for Trading Code

Trading systems often store data such as:

    bid price
    ask price
    quantity
    spread
    order id
    timestamp

These values must be initialized correctly.

A wrong or uninitialized value can cause incorrect calculations, invalid orders, or risky trading decisions.

Main idea:

    In trading code, bad memory assumptions can become real financial bugs.

* * *

## 7. End-of-Day Checklist

You should be able to answer:

    1. What is a variable?
    2. What is an object?
    3. Where does an object live?
    4. Why is initialization important?
    5. What happens when a value is copied?
    6. When does a local object die?

* * *

## 8. Conclusion

Object, variable, and memory are the foundation of C++.

The key idea:

    A variable is a name.
    An object is the real thing stored in memory.
    Initialization makes the object start in a valid state.