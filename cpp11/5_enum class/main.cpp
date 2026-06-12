#include <iostream>
#include <string>
#include <vector>
#include <iomanip>

enum class Side {
    Buy,
    Sell
};

enum class OrderType {
    Market,
    Limit
};

enum class OrderStatus {
    New,
    Filled,
    Cancelled,
    Rejected
};

struct Order {
    int id;
    std::string symbol;
    Side side;
    OrderType type;
    OrderStatus status;
    double price;
    int quantity;
};

std::string toString(Side side) {
    switch (side) {
        case Side::Buy:
            return "Buy";
        case Side::Sell:
            return "Sell";
    }

    return "Unknown";
}

std::string toString(OrderType type) {
    switch (type) {
        case OrderType::Market:
            return "Market";
        case OrderType::Limit:
            return "Limit";
    }

    return "Unknown";
}

std::string toString(OrderStatus status) {
    switch (status) {
        case OrderStatus::New:
            return "New";
        case OrderStatus::Filled:
            return "Filled";
        case OrderStatus::Cancelled:
            return "Cancelled";
        case OrderStatus::Rejected:
            return "Rejected";
    }

    return "Unknown";
}

void printOrder(const Order& order) {
    std::cout << "Order ID: " << order.id << '\n';
    std::cout << "Symbol: " << order.symbol << '\n';
    std::cout << "Side: " << toString(order.side) << '\n';
    std::cout << "Type: " << toString(order.type) << '\n';
    std::cout << "Status: " << toString(order.status) << '\n';
    std::cout << "Price: " << std::fixed << std::setprecision(2)
              << order.price << '\n';
    std::cout << "Quantity: " << order.quantity << '\n';
}

bool isActive(OrderStatus status) {
    return status == OrderStatus::New;
}

void cancelOrder(Order& order) {
    if (isActive(order.status)) {
        order.status = OrderStatus::Cancelled;
    }
}

int main() {
    std::vector<Order> orders = {
        {101, "AAPL", Side::Buy, OrderType::Limit, OrderStatus::New, 191.25, 100},
        {102, "MSFT", Side::Sell, OrderType::Market, OrderStatus::Filled, 0.00, 50},
        {103, "NVDA", Side::Buy, OrderType::Limit, OrderStatus::New, 875.10, 10}
    };

    std::cout << "Before cancel:\n";
    printOrder(orders[0]);

    cancelOrder(orders[0]);

    std::cout << "\nAfter cancel:\n";
    printOrder(orders[0]);

    std::cout << "\nAll orders:\n";

    for (const auto& order : orders) {
        std::cout << order.id << " | "
                  << order.symbol << " | "
                  << toString(order.side) << " | "
                  << toString(order.type) << " | "
                  << toString(order.status) << '\n';
    }

    return 0;
}