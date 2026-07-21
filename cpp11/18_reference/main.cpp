#include <cassert>
#include <iostream>

struct Position {
    int quantity;
};

void apply_trade(Position& position, int traded_quantity) {
    position.quantity += traded_quantity;
}

int main() {
    Position btc{100};

    apply_trade(btc, 50);

    std::cout << "BTC position: " << btc.quantity << '\n';
}