#include <algorithm>
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
        {103, "NVDA", 800}
    };

    int threshold = 1000;

    auto isLargeOrder = [threshold](const Order& o) {
        return o.quantity > threshold;
    };

    threshold = 2000;

    int cnt = 0;
    for (const auto& order : orders) {
        if (isLargeOrder(order)) {
            ++cnt;
        }
    }

    std::cout << "Large order count = " << cnt << '\n';

    return 0;
}