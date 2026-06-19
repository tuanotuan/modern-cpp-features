#include <iostream>
#include <string>
#include <vector>

struct Order {
    int id;
    std::string symbol;
    int quantity;
};

int main() {
    std::vector<Order> orders{
        {101, "AAPL", 100},
        {102, "MSFT", 1500},
        {103, "NVDA", 2000}
    };

    int largeCount = 0;

    auto countLargeOrder = [largeCount](const Order& o) mutable {
        if (o.quantity > 1000) {
            largeCount++;
        }

        return largeCount;
    };

    for (const auto& order : orders) {
        int current = countLargeOrder(order);
        std::cout << order.symbol << " -> internal count = "
                  << current << '\n';
    }

    std::cout << "outside largeCount = " << largeCount << '\n';

    return 0;
}