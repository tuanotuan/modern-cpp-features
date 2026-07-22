#include <iostream>

void update(double& price)
{
    price += 0.5;
}

int main()
{
    double bid = 100.0;
    double& ref = bid;

    update(ref);

    std::cout << bid << '\n';
}