#include <iostream>
#include <string>
#include <vector>

struct Trade {
    std::string symbol;
    double price;
    int quantity;
};

int main() {
    std::vector<Trade> trades{
        {"AAPL", 191.25, 100},
        {"MSFT", 420.50, 50},
        {"NVDA", 875.10, 10}
    };

    int totalVolume = 0;
    double totalNotional = 0.0;

    auto accumulate = [&totalVolume, &totalNotional](const Trade& t) {
        totalVolume += t.quantity;
        totalNotional += t.price * t.quantity;
    };

    for (const auto& trade : trades) {
        accumulate(trade);
    }

    std::cout << "Total volume = " << totalVolume << '\n';
    std::cout << "Total notional = " << totalNotional << '\n';

    return 0;
}