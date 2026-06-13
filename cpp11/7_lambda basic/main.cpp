#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

struct Order {
    int id;
    std::string symbol;
    double price;
    int quantity;
};

int main() {
    std::vector<Order> orders{
        {101, "AAPL", 191.25, 100},
        {102, "MSFT", 420.50, 1500},
        {103, "NVDA", 875.10, 300}
    };

    std::sort(orders.begin(), orders.end(), [](const Order& a, const Order& b) {
        return a.price < b.price;
    });
    for (const auto& order : orders) {
        std::cout << order.id << " "
                  << order.symbol << " "
                  << order.price << " "
                  << order.quantity << '\n';
    }

    return 0;
}