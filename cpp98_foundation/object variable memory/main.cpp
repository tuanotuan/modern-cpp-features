#include <iostream>

int main() {
    int bidPrice = 100;
    int askPrice = 101;
    int quantity = 50;

    int spread = askPrice - bidPrice;
    int notional = askPrice * quantity;

    std::cout << "Bid: " << bidPrice << "\n";
    std::cout << "Ask: " << askPrice << "\n";
    std::cout << "Spread: " << spread << "\n";
    std::cout << "Notional: " << notional << "\n";

    return 0;
}