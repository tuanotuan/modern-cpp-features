#include <iostream>
#include <string>
#include <utility>

int main()
{
    std::string source = "BTCUSD";
    std::string target = std::move(source);

    std::cout << target << '\n';

    source = "ETHUSD";
    std::cout << source << '\n';
}