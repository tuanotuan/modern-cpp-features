# C++98 Struct and Padding

## 1. Goal

Learn how C++ groups related data using structures and why object size may be larger than the sum of its fields.

After this lesson, you should understand:

    1. What a struct is.
    2. How struct objects are stored.
    3. What padding is.
    4. Why alignment exists.
    5. How field ordering affects memory usage.

* * *

## 2. What Problem Does This Solve?

Real-world data usually contains multiple fields.

Examples:

    order
    trade
    quote
    position

A struct groups related information into a single object.

* * *

## 3. Minimum Syntax

Define a structure:

    struct Trade
    {
        int price;
        int quantity;
        char side;
    };

Create an object:

    Trade trade;

Access fields:

    trade.price
    trade.quantity
    trade.side

* * *

## 4. Memory Model

A struct is stored as a single contiguous object.

Fields appear in declaration order.

However, compilers may insert extra bytes between fields.

These bytes are called:

    padding

* * *

## 5. Padding

Padding is inserted to satisfy alignment requirements.

Benefits:

    faster memory access
    better CPU efficiency

Important:

    sizeof(struct)
    is not necessarily equal to
    sum(sizeof(fields))

* * *

## 6. Common Mistakes

### 6.1 Assuming No Padding

Struct size may be larger than expected.

Always verify with:

    sizeof(...)

* * *

### 6.2 Poor Field Ordering

Bad field ordering may waste memory.

Placing larger fields first often reduces padding.

* * *

### 6.3 Comparing Raw Memory

Padding bytes may contain unspecified values.

Raw memory comparison can be unreliable.

* * *

## 7. Notes for Trading Code

Trading systems process millions of messages.

Common structures:

    Trade
    Quote
    Order
    MarketDataEvent

Memory layout directly affects:

    cache efficiency
    latency
    throughput

Understanding padding is important for high-performance systems.

* * *

## 8. End-of-Day Checklist

You should be able to answer:

    1. What is a struct?
    2. Why use a struct instead of separate variables?
    3. What is padding?
    4. Why does padding exist?
    5. Why can sizeof(struct) be larger than expected?
    6. How can field order affect memory usage?

* * *

## 9. Conclusion

Structs combine multiple fields into a single object.

The key idea:

    Memory layout matters.

Padding exists to improve alignment and CPU performance.

Understanding struct layout is a fundamental skill for systems programming and low-latency software.