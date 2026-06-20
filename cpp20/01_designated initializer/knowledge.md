# Modern C++20 - Day 1: `Designated Initializers`

## 1. Goal

After learning `Designated Initializers`, you should understand:

    1. What problem designated initializers solve.
    2. How to initialize struct members by name.
    3. Why member declaration order still matters.
    4. Why this feature only works with aggregate types.
    5. Common mistakes when using designated initializers.

* * *

## 2. What Problem Does It Solve?

Before C++20, aggregate objects were usually initialized by position.

    struct Order {
        int id;
        double price;
        int quantity;
        bool isBuy;
    };

    Order order{1001, 245.75, 50, true};

This works, but the meaning of each value is not clear.

C++20 introduced designated initializers to make aggregate initialization more explicit.

    Order order{
        .id = 1001,
        .price = 245.75,
        .quantity = 50,
        .isBuy = true
    };

Main idea:

    Initialize struct members by name instead of relying only on position.

* * *

## 3. Minimum Syntax

Define an aggregate type:

    struct Config {
        int maxOrders;
        double tickSize;
        bool enableLogging;
    };

Initialize members by name:

    Config config{
        .maxOrders = 1000,
        .tickSize = 0.01,
        .enableLogging = true
    };

You can also initialize only some members:

    Config config{
        .maxOrders = 1000,
        .tickSize = 0.01
    };

The remaining members are value-initialized.

* * *

## 4. Member Order Still Matters

Designated initializers must follow the declaration order of the struct.

Correct:

    struct Order {
        int id;
        double price;
        int quantity;
    };

    Order order{
        .id = 1001,
        .price = 245.75,
        .quantity = 50
    };

Wrong:

    Order order{
        .quantity = 50,
        .id = 1001,
        .price = 245.75
    };

Even though member names are written clearly, C++ still requires them to appear in declaration order.

Simple rule:

    You can skip members.
    You cannot go backward.

* * *

## 5. Aggregate Types Only

Designated initializers work only with aggregate types.

A simple struct is usually an aggregate:

    struct Order {
        int id;
        double price;
        int quantity;
    };

This works:

    Order order{
        .id = 1001,
        .price = 245.75,
        .quantity = 50
    };

But if the struct has a user-defined constructor, it is not initialized this way:

    struct Order {
        int id;
        double price;

        Order(int orderId, double orderPrice)
            : id(orderId), price(orderPrice) {}
    };

This is not valid:

    Order order{
        .id = 1001,
        .price = 245.75
    };

Use the constructor instead:

    Order order(1001, 245.75);

* * *

## 6. Common Mistakes

### 6.1. Thinking member order does not matter

Wrong:

    Config config{
        .enableLogging = true,
        .maxOrders = 1000
    };

Designators must follow the same order as the struct declaration.

* * *

### 6.2. Thinking it works with constructors

Designated initializers are not constructor named arguments.

Wrong idea:

    Order order{
        .id = 1001,
        .price = 245.75
    };

This only works for aggregate initialization, not for normal constructor calls.

* * *

### 6.3. Thinking C++ has named parameters

C++ does not support named parameters for functions.

Wrong:

    sendOrder(
        .price = 245.75,
        .quantity = 50
    );

Designated initializers are for aggregate objects, not function arguments.

* * *

## 7. Notes for Trading / Performance-Sensitive Code

Trading systems often use simple data structures for:

    Orders
    Trades
    Market data messages
    Risk limits
    Engine configuration
    Backtest parameters

Example:

    struct RiskConfig {
        int maxPosition;
        double maxLoss;
        bool enableKillSwitch;
    };

    RiskConfig risk{
        .maxPosition = 1000,
        .maxLoss = 5000.0,
        .enableKillSwitch = true
    };

Designated initializers make these objects easier to read and harder to initialize incorrectly.

* * *

## 8. End-of-Day Checklist

You should remember:

    Designated Initializers = initialize aggregate members by name

You should be able to answer:

    1. What problem do designated initializers solve?
    2. Can you initialize only some members?
    3. Does member order matter?
    4. What is an aggregate type?
    5. Are designated initializers the same as named parameters?

* * *

## 9. Conclusion

Designated initializers make struct initialization clearer and safer.

The key idea:

    Use designated initializers when you want readable aggregate initialization.
    Remember that member order still matters.
    Do not use it as a replacement for constructor named arguments.