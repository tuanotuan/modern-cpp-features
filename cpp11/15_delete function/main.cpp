#include <iostream>

class OrderManager {
public:
    OrderManager() = default;

    OrderManager(const OrderManager&) = delete;
    OrderManager& operator=(const OrderManager&) = delete;

    void submitOrder(int quantity) {
        std::cout << "Submit order quantity = " << quantity << '\n';
    }
};

int main() {
    OrderManager manager;

    manager.submitOrder(100);

    // Uncomment dòng này sẽ lỗi compile:
    // OrderManager copy = manager;

    return 0;
}