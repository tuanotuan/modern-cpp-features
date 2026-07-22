# Day 24 — Moved-From Objects

## Core Idea

A moved-from object is an object whose resources may have been transferred to another object.

The moved-from object still exists, but its previous value should not be assumed.

## Example

```cpp
T target = std::move(source);

After the move:

target may own the transferred resources.
source remains valid.
The old value of source is unspecified.
Safe Operations

A moved-from object may safely be:

Assigned a new value
Destroyed
Reinitialized
Used only when the operation does not depend on its previous value
Common Mistakes
Assuming the old value is unchanged
Using the moved-from value in program logic
Moving an object before its value is no longer needed
Treating a moved-from object as destroyed
Practical Rule

After moving from an object, either assign it a new value or stop depending on its stored data.

Key Takeaway

A moved-from object remains valid, but its previous value should not be trusted.