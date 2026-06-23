#include <iostream>

struct Trade
{
    int price;
    int quantity;
    char side;
};

int main()
{
    Trade trade;

    trade.price = 100;
    trade.quantity = 50;
    trade.side = 'B';

    std::cout << "Price: "
              << trade.price
              << '\n';

    std::cout << "Sizeof Trade: "
              << sizeof(Trade)
              << '\n';

    return 0;
}