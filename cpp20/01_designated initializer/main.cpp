#include <iostream>

struct MarketOrder {
    int order_id;
    double price;
    int quantity;
    bool is_buy;
};

int main() {
    MarketOrder order{
        .order_id = 1001,
        .price = 245.75,
        .quantity = 50,
        .is_buy = true
    };

    std::cout
        << "OrderID: " << order.order_id
        << ", Price: " << order.price
        << ", Qty: " << order.quantity
        << ", Side: " << (order.is_buy ? "BUY" : "SELL")
        << '\n';
}