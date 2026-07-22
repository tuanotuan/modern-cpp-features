#include <iostream>
#include <string>

void publish(std::string&& symbol)
{
    std::cout << symbol << '\n';
}

int main()
{
    publish("EURUSD");
    publish(std::string("BTCUSD"));
}