#include <iostream>
#include <vector>
#include <string>

struct Order {
    int id;
    std::string symbol;
    double price;
    int quantity;
};

Order* findOrderById(std::vector<Order>& orders, int target_id) {
    for (auto& order : orders) {
        if (order.id == target_id) {
            return &order;
        }
    }

    // Không tìm thấy order nào
    return nullptr;
}

void printOrder(const Order* order) {
    if (order == nullptr) {
        std::cout << "Order not found\n";
        return;
    }

    std::cout << "Order ID: " << order->id << '\n';
    std::cout << "Symbol: " << order->symbol << '\n';
    std::cout << "Price: " << order->price << '\n';
    std::cout << "Quantity: " << order->quantity << '\n';
}

int main() {
    std::vector<Order> orders = {
        {101, "AAPL", 191.25, 100},
        {102, "MSFT", 420.50, 50},
        {103, "NVDA", 875.10, 10}
    };

    Order* order1 = findOrderById(orders, 102);
    printOrder(order1);

    std::cout << "----\n";

    Order* order2 = findOrderById(orders, 999);
    printOrder(order2);

    return 0;
}