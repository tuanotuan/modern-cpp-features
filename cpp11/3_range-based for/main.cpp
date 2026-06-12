#include <iostream>
#include <vector>
#include <string>
#include <iomanip>

struct Position {
    std::string symbol;
    int quantity;
    double last_price;
};

double calculateTotalMarketValue(const std::vector<Position>& positions) {
    double total = 0.0;

    for (const auto& pos : positions) {
        total += pos.quantity * pos.last_price;
    }

    return total;
}

void printPositions(const std::vector<Position>& positions) {
    std::cout << "Current positions:\n";
    for (const auto& pos : positions) {
        std::cout << pos.symbol
                  << " | qty = " << pos.quantity
                  << " | last_price = " << std::fixed << std::setprecision(2)
                  << pos.last_price
                  << '\n';
    }
}

int main() {
    std::vector<Position> positions = {
        {"AAPL", 100, 191.25},
        {"MSFT", 50, 420.50},
        {"NVDA", 10, 875.10}
    };

    printPositions(positions);

    double total_value = calculateTotalMarketValue(positions);
    std::cout << "\nTotal market value = "
              << std::fixed << std::setprecision(2)
              << total_value << "\n\n";

    return 0;
}