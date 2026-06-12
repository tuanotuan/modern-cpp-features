#include <iostream>
#include <string>
#include <vector>
#include <iomanip>

enum Side {
    Buy,
    Sell
};

enum OrderType {
    Market,
    Limit
};

enum OrderStatus {
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

std::string sideToString(Side side) {
    switch (side) {
        case Buy:
            return "Buy";
        case Sell:
            return "Sell";
    }

    return "Unknown";
}

std::string typeToString(OrderType type) {
    switch (type) {
        case Market:
            return "Market";
        case Limit:
            return "Limit";
    }

    return "Unknown";
}

std::string statusToString(OrderStatus status) {
    switch (status) {
        case New:
            return "New";
        case Filled:
            return "Filled";
        case Cancelled:
            return "Cancelled";
        case Rejected:
            return "Rejected";
    }

    return "Unknown";
}

bool isActive(OrderStatus status) {
    return status == New;
}

void cancelOrder(Order& order) {
    if (isActive(order.status)) {
        order.status = Cancelled;
    }
}

void printOrder(const Order& order) {
    std::cout << "Order ID: " << order.id << '\n';
    std::cout << "Symbol: " << order.symbol << '\n';
    std::cout << "Side: " << sideToString(order.side) << '\n';
    std::cout << "Type: " << typeToString(order.type) << '\n';
    std::cout << "Status: " << statusToString(order.status) << '\n';
    std::cout << "Price: " << std::fixed << std::setprecision(2)
              << order.price << '\n';
    std::cout << "Quantity: " << order.quantity << '\n';
}

int main() {
    std::vector<Order> orders = {
        {101, "AAPL", Buy, Limit, New, 191.25, 100},
        {102, "MSFT", Sell, Market, Filled, 0.00, 50},
        {103, "NVDA", Buy, Limit, New, 875.10, 10}
    };

    std::cout << "Before cancel:\n";
    printOrder(orders[0]);

    cancelOrder(orders[0]);

    std::cout << "\nAfter cancel:\n";
    printOrder(orders[0]);

    std::cout << "\nEnum integer values:\n";
    std::cout << "Buy = " << Buy << '\n';
    std::cout << "Sell = " << Sell << '\n';
    std::cout << "New = " << New << '\n';
    std::cout << "Filled = " << Filled << '\n';
    std::cout << "Cancelled = " << Cancelled << '\n';
    std::cout << "Rejected = " << Rejected << '\n';

    return 0;
}