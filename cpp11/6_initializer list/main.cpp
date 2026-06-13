#include <iostream>
#include <vector>
#include <string>
#include <unordered_map>

struct Order {
    int id;
    std::string symbol;
    double price;
    int quantity;
};

int main() {
    Order o{101, "AAPL", 191.25, 100};

    std::vector<Order> orders{
        {101, "AAPL", 191.25, 100},
        {102, "MSFT", 420.50, 50},
        {103, "NVDA", 875.10, 10}
    };

    std::unordered_map<std::string, double> last_price{
        {"AAPL", 191.25},
        {"MSFT", 420.50},
        {"NVDA", 875.10}
    };

    std::cout << o.symbol << " " << o.price << " " << o.quantity << '\n';

    for (const auto& order : orders) {
        std::cout << order.id << " "
                  << order.symbol << " "
                  << order.price << " "
                  << order.quantity << '\n';
    }

    std::cout << "MSFT last price = " << last_price["MSFT"] << '\n';

    return 0;
}