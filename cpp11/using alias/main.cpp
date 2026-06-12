#include <iostream>
#include <string>
#include <vector>
#include <unordered_map>
#include <iomanip>

using Symbol = std::string;
using Price = double;
using Quantity = int;

using PriceHistory = std::unordered_map<Symbol, std::vector<Price>>;
using PositionMap = std::unordered_map<Symbol, Quantity>;

struct Tick {
    Symbol symbol;
    Price price;
    Quantity quantity;
};

void addTick(PriceHistory& history, const Tick& tick) {
    history[tick.symbol].push_back(tick.price);
}

void updatePosition(PositionMap& positions, const Tick& tick) {
    positions[tick.symbol] += tick.quantity;
}

void printPriceHistory(const PriceHistory& history) {
    std::cout << "Price history:\n";

    for (const auto& item : history) {
        const Symbol& symbol = item.first;
        const std::vector<Price>& prices = item.second;

        std::cout << symbol << ": ";

        for (Price price : prices) {
            std::cout << std::fixed << std::setprecision(2)
                      << price << " ";
        }

        std::cout << '\n';
    }
}

void printPositions(const PositionMap& positions) {
    std::cout << "\nPositions:\n";

    for (const auto& item : positions) {
        const Symbol& symbol = item.first;
        Quantity quantity = item.second;

        std::cout << symbol << " -> " << quantity << '\n';
    }
}

int main() {
    std::vector<Tick> ticks = {
        {"AAPL", 191.25, 100},
        {"MSFT", 420.50, 50},
        {"AAPL", 191.40, 200},
        {"NVDA", 875.10, 10},
        {"MSFT", 421.00, 70}
    };

    PriceHistory history;
    PositionMap positions;

    for (const auto& tick : ticks) {
        addTick(history, tick);
        updatePosition(positions, tick);
    }

    printPriceHistory(history);
    printPositions(positions);

    return 0;
}