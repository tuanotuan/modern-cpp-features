#include <iostream>

constexpr int MaxOrders = 1000;
constexpr int MaxPrice = 1000000;

static_assert(MaxOrders > 0,
              "MaxOrders must be positive");

static_assert(MaxPrice > 0,
              "MaxPrice must be positive");

static_assert(MaxOrders <= 5000,
              "MaxOrders exceeds system capacity");

int main() {
    std::cout << "Configuration is valid\n";
    std::cout << "Max orders: " << MaxOrders << '\n';
    std::cout << "Max price: " << MaxPrice << '\n';
}