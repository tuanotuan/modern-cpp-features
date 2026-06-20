#include <iostream>

constexpr int MaxOrders = 1000;
constexpr int MaxPrice = 1'000'000;

static_assert(MaxOrders > 0,
              "MaxOrders must be positive");

static_assert(MaxPrice > 0,
              "MaxPrice must be positive");

static_assert(MaxOrders <= 5000,
              "MaxOrders exceeds system capacity");

int main() {
    std::cout << "Configuration is valid\n";
    std::cout << "Max orders: " << MaxOrders << '\n';
}