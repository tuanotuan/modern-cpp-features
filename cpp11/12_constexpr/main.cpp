#include <iostream>

constexpr int MaxOrders = 1000;

constexpr int doubleValue(int x) {
    return x * 2;
}

int main() {
    int orderIds[MaxOrders];

    constexpr int Limit = doubleValue(50);

    orderIds[0] = 101;

    std::cout << "Max orders = " << MaxOrders << '\n';
    std::cout << "Limit = " << Limit << '\n';
    std::cout << "First order id = " << orderIds[0] << '\n';

    return 0;
}