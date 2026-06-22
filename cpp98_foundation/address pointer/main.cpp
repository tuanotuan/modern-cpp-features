#include <iostream>

struct Order {
    int price;
    int quantity;
};

int main() {
    Order order{100, 50};

    Order* ptr = &order;

    ptr->price = 101;

    std::cout << "Price: "
              << order.price
              << '\n';

    return 0;
}