#include <iostream>

class Order {
public:
    Order() = default;

    Order(int id, int quantity)
        : id(id), quantity(quantity) {
    }

    void print() {
        std::cout << "Order ID: " << id << '\n';
        std::cout << "Quantity: " << quantity << '\n';
    }

private:
    int id{};
    int quantity{};
};

int main() {
    Order emptyOrder;
    Order buyOrder(101, 50);

    emptyOrder.print();
    buyOrder.print();

    return 0;
}