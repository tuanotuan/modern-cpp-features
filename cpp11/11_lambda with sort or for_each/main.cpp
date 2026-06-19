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
        {102, "MSFT", 420.50, 50},
        {103, "NVDA", 875.10, 10}
    };

    std::sort(orders.begin(), orders.end(), [](const Order& a, const Order& b) {
        return a.price < b.price;
    });

    std::for_each(orders.begin(), orders.end(), [](Order& o) {
        if (o.quantity < 50) {
            o.quantity = 0;
        }
    });

    std::for_each(orders.begin(), orders.end(), [](const Order& o) {
        std::cout << o.id << " "
                  << o.symbol << " "
                  << o.price << " "
                  << o.quantity << '\n';
    });

    return 0;
}