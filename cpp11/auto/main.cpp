#include <iostream>
#include <string>
#include <vector>
#include <unordered_map>
#include <iomanip>
struct Tick{
    std::string symbol;
    double price;
    int quantity;
};
int main(){
    std::vector<Tick> ticks = {
        {"AAPL", 191.25, 100},
        {"MSFT", 420.50, 50},
        {"AAPL", 191.40, 200},
        {"NVDA", 875.10, 10},
        {"MSFT", 421.00, 70}
    };

    std::unordered_map<std::string, double> last_price;
    std::unordered_map<std::string, int> total_quantity;
    for(const auto& tick : ticks){
        last_price[tick.symbol] = tick.price;
        total_quantity[tick.symbol] += tick.quantity;
    }
    for(auto it = last_price.begin(); it != last_price.end(); ++it){
        const auto& symbol = it->first;
        auto price = it->second;

        std::cout << symbol << " -> "
                  << std::fixed << std::setprecision(2)
                  << price << '\n';
    }
    return 0;
}