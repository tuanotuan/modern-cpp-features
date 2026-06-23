#include <iostream>

struct Order {
    int price;
    int quantity;
};

void updatePrice(Order& order)
{
    order.price += 1;
}

int main()
{
    Order order = {100, 50};

    updatePrice(order);

    std::cout << "Price: "
              << order.price
              << '\n';

    return 0;
}