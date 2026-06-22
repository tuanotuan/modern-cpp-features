# C++98 Prep - Address / Pointer

## 1. Goal

Learn how C++ accesses objects through memory addresses.

After this lesson, you should understand:

    1. What an address is.
    2. What a pointer is.
    3. How dereferencing works.
    4. Common pointer mistakes.
    5. Why pointers are fundamental in C++.

* * *

## 2. What Problem Does This Solve?

Every object occupies memory.

A pointer allows a program to store and manipulate the address of an object instead of directly storing the object itself.

Main idea:

    Object -> lives in memory
    Address -> location of the object
    Pointer -> stores the address

* * *

## 3. Minimum Syntax

Take an address:

    &object

Store an address:

    type* ptr

Access the object through a pointer:

    *ptr

Access members through a pointer:

    ptr->member

* * *

## 4. Memory Model

Conceptually:

    object ---> memory location

A pointer stores that location.

Example idea:

    x contains 10
    ptr contains address of x

Dereferencing:

    *ptr

means:

    go to the stored address
    access the object there

* * *

## 5. Common Mistakes

### 5.1 Null Pointer Dereference

A null pointer does not point to a valid object.

Dereferencing it causes undefined behavior.

* * *

### 5.2 Uninitialized Pointer

A pointer that was never initialized contains an unpredictable address.

Always initialize pointers.

* * *

### 5.3 Dangling Pointer

A pointer may outlive the object it points to.

The address remains but the object no longer exists.

This creates dangerous bugs.

* * *

### 5.4 Confusing Pointer with Object

A pointer stores an address.

The object is accessed through dereferencing.

Remember:

    ptr   -> address
    *ptr  -> object

* * *

## 6. Notes for Trading Code

Pointers are heavily used in:

    order management
    market data handlers
    order books
    memory pools
    network buffers

Why?

Because copying large objects is expensive.

Passing addresses is usually much cheaper.

* * *

## 7. End-of-Day Checklist

You should be able to answer:

    1. What is an address?
    2. What is a pointer?
    3. What does '&' mean?
    4. What does '*' mean?
    5. What is dereferencing?
    6. What is a dangling pointer?
    7. Why are pointers useful?

* * *

## 8. Conclusion

Pointers are variables that store addresses.

The key idea:

    Address identifies an object.
    Pointer stores the address.
    Dereferencing accesses the object.