# C++98 Prep - Array and One-Past-End

## 1. Goal

Learn how arrays are stored in memory and why C++ allows pointers to point one position past the last element.

After this lesson, you should understand:

    1. How arrays are laid out in memory.
    2. How pointer arithmetic works.
    3. What one-past-end means.
    4. Why STL uses [begin, end).
    5. Common array mistakes.

* * *

## 2. What Problem Does This Solve?

Programs often need to store many objects of the same type.

Arrays provide:

    contiguous storage
    fast indexing
    cache-friendly access

Arrays are one of the most fundamental data structures in C++.

* * *

## 3. Minimum Syntax

Create an array:

    int arr[5];

Initialize an array:

    int arr[5] = {1,2,3,4,5};

Access an element:

    arr[i]

Pointer to first element:

    arr

One-past-end pointer:

    arr + N

* * *

## 4. Memory Model

Array elements are stored consecutively.

Conceptually:

    arr[0]
    arr[1]
    arr[2]
    ...
    arr[N-1]

Immediately after the final element is:

    arr + N

This is called the one-past-end position.

* * *

## 5. One-Past-End

C++ allows a pointer to point:

    exactly one position past the last element

Example:

    arr + N

Valid operations:

    comparison
    subtraction
    loop termination

Invalid operation:

    dereferencing

Never access:

    *(arr + N)

* * *

## 6. Common Mistakes

### 6.1 Out-of-Bounds Access

Accessing beyond the array limits causes undefined behavior.

* * *

### 6.2 Dereferencing One-Past-End

The end pointer is a marker.

It is not an element.

* * *

### 6.3 Going Beyond One-Past-End

Only one position beyond the final element is valid.

Further positions are undefined behavior.

* * *

### 6.4 Confusing Arrays and Pointers

An array owns storage.

A pointer only stores an address.

They are closely related but not identical.

* * *

## 7. Notes for Trading Code

Arrays are commonly used for:

    prices
    quantities
    order levels
    market snapshots
    temporary buffers

Benefits:

    predictable layout
    fast iteration
    good cache locality

* * *

## 8. STL Connection

Most STL algorithms use:

    [begin, end)

where:

    begin -> first element
    end   -> one-past-last element

Examples:

    sort(begin, end)
    find(begin, end)
    copy(begin, end)

Understanding one-past-end is essential for STL.

* * *

## 9. End-of-Day Checklist

You should be able to answer:

    1. How is an array stored in memory?
    2. What does arr mean in most expressions?
    3. What is arr + N?
    4. Why is one-past-end allowed?
    5. Why can't it be dereferenced?
    6. Why does STL use [begin, end)?

* * *

## 10. Conclusion

Arrays are contiguous blocks of memory.

The key idea:

    First element -> begin
    One-past-last -> end

This convention became the foundation of STL iterators and algorithms.